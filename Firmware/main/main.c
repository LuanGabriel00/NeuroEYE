/**
 * Eye-facing ESP32 camera stream over Wi-Fi (MJPEG) + Easy Wi-Fi Setup.
 * Fonte de vídeo: câmera USB (UVC) conectada na porta USB-OTG.
 */

#include "sdkconfig.h"

#include <esp_log.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include <esp_event.h>
#include <esp_netif.h>
#include <esp_mac.h>
#include <esp_psram.h>
#include <esp_heap_caps.h>
#include <nvs_flash.h>
#include <nvs.h>
#include <string.h>
#include <stdlib.h>
#include <stdio.h>

#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/semphr.h"
#include "esp_http_server.h"
#include "mdns.h"

#include "usb/usb_host.h"
#include "usb/uvc_host.h"

static const char *TAG = "eye:stream";

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define WIFI_MAX_RETRY     6
#define NVS_WIFI_NAMESPACE "wifi_creds"

static EventGroupHandle_t s_wifi_event_group;
static int s_retry_num = 0;
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data);

/* ---- Configuração da câmera USB ----------------------------------------- */

#define UVC_WIDTH           640
#define UVC_HEIGHT          480
#define UVC_FPS             15
#define UVC_MAX_FRAME_SIZE  (256 * 1024)

/* ---- Estado compartilhado do último frame ------------------------------- */

static SemaphoreHandle_t s_frame_mutex;
static uint8_t *s_latest_buf = NULL;
static size_t   s_latest_len = 0;
static volatile uint32_t s_frame_seq = 0;

static uvc_host_stream_hdl_t s_stream = NULL;
static volatile bool s_cam_disconnected = false;

static uint32_t buf_caps(void)
{
    return esp_psram_is_initialized() ? MALLOC_CAP_SPIRAM : MALLOC_CAP_8BIT;
}

/* ---- Câmera UVC (rodando no Core 1 para não travar Wi-Fi/HTTP no Core 0) - */

static bool uvc_frame_cb(const uvc_host_frame_t *frame, void *user_ctx)
{
    if (frame->data_len > 0 && frame->data_len <= UVC_MAX_FRAME_SIZE) {
        if (xSemaphoreTake(s_frame_mutex, pdMS_TO_TICKS(10)) == pdTRUE) {
            memcpy(s_latest_buf, frame->data, frame->data_len);
            s_latest_len = frame->data_len;
            s_frame_seq++;
            xSemaphoreGive(s_frame_mutex);
        }
    }
    return true;
}

static void uvc_event_cb(const uvc_host_stream_event_data_t *event, void *user_ctx)
{
    switch (event->type) {
    case UVC_HOST_DEVICE_DISCONNECTED:
        ESP_LOGW(TAG, "Câmera USB desconectada");
        s_cam_disconnected = true;
        break;
    case UVC_HOST_TRANSFER_ERROR:
        ESP_LOGW(TAG, "Erro de transferência USB");
        break;
    case UVC_HOST_FRAME_BUFFER_OVERFLOW:
        ESP_LOGW(TAG, "Overflow de frame buffer");
        break;
    default:
        break;
    }
}

static void usb_lib_task(void *arg)
{
    while (1) {
        uint32_t flags;
        usb_host_lib_handle_events(portMAX_DELAY, &flags);
        if (flags & USB_HOST_LIB_EVENT_FLAGS_NO_CLIENTS) {
            usb_host_device_free_all();
        }
    }
}

static esp_err_t open_uvc_stream(void)
{
    const uvc_host_stream_config_t stream_config = {
        .event_cb = uvc_event_cb,
        .frame_cb = uvc_frame_cb,
        .user_ctx = NULL,
        .usb = {
            .vid = UVC_HOST_ANY_VID,
            .pid = UVC_HOST_ANY_PID,
            .uvc_stream_index = 0,
        },
        .vs_format = {
            .h_res  = UVC_WIDTH,
            .v_res  = UVC_HEIGHT,
            .fps    = UVC_FPS,
            .format = UVC_VS_FORMAT_MJPEG,
        },
        .advanced = {
            .number_of_frame_buffers = 3,
            .frame_size              = UVC_MAX_FRAME_SIZE,
            .frame_heap_caps         = buf_caps(),
            .number_of_urbs          = 4,
            .urb_size                = 32 * 1024,
        },
    };

    esp_err_t err = uvc_host_stream_open(&stream_config, pdMS_TO_TICKS(2000), &s_stream);
    if (err != ESP_OK) return err;

    err = uvc_host_stream_start(s_stream);
    if (err != ESP_OK) {
        uvc_host_stream_close(s_stream);
        s_stream = NULL;
        return err;
    }
    ESP_LOGI(TAG, "Câmera USB iniciada: %dx%d @ %d fps (MJPEG)", UVC_WIDTH, UVC_HEIGHT, UVC_FPS);
    return ESP_OK;
}

static void uvc_manager_task(void *arg)
{
    while (1) {
        if (s_stream == NULL) {
            if (open_uvc_stream() != ESP_OK) {
                vTaskDelay(pdMS_TO_TICKS(2000));
                continue;
            }
            s_cam_disconnected = false;
        } else if (s_cam_disconnected) {
            uvc_host_stream_close(s_stream);
            s_stream = NULL;
            s_latest_len = 0;
        }
        vTaskDelay(pdMS_TO_TICKS(500));
    }
}

static esp_err_t init_camera(void)
{
    s_frame_mutex = xSemaphoreCreateMutex();
    s_latest_buf  = heap_caps_malloc(UVC_MAX_FRAME_SIZE, buf_caps());
    if (!s_frame_mutex || !s_latest_buf) {
        ESP_LOGE(TAG, "Sem memória para o buffer de frame");
        return ESP_ERR_NO_MEM;
    }

    const usb_host_config_t host_config = {
        .skip_phy_setup = false,
        .intr_flags     = ESP_INTR_FLAG_LEVEL1,
    };
    ESP_ERROR_CHECK(usb_host_install(&host_config));
    xTaskCreatePinnedToCore(usb_lib_task, "usb_lib", 4096, NULL, 10, NULL, 1);

    const uvc_host_driver_config_t driver_config = {
        .driver_task_stack_size = 4096,
        .driver_task_priority   = 9,
        .xCoreID                = 1,
        .create_background_task = true,
    };
    ESP_ERROR_CHECK(uvc_host_install(&driver_config));

    xTaskCreatePinnedToCore(uvc_manager_task, "uvc_mgr", 4096, NULL, 5, NULL, 1);
    return ESP_OK;
}

/* ---- NVS & Easy Wi-Fi Provisioning -------------------------------------- */

static bool load_wifi_credentials(char *ssid, size_t ssid_len, char *pass, size_t pass_len)
{
    nvs_handle_t handle;
    if (nvs_open(NVS_WIFI_NAMESPACE, NVS_READONLY, &handle) != ESP_OK) {
        return false;
    }
    esp_err_t err1 = nvs_get_str(handle, "ssid", ssid, &ssid_len);
    esp_err_t err2 = nvs_get_str(handle, "pass", pass, &pass_len);
    nvs_close(handle);

    return (err1 == ESP_OK && err2 == ESP_OK && strlen(ssid) > 0);
}

static esp_err_t save_wifi_credentials(const char *ssid, const char *pass)
{
    nvs_handle_t handle;
    esp_err_t err = nvs_open(NVS_WIFI_NAMESPACE, NVS_READWRITE, &handle);
    if (err != ESP_OK) return err;

    nvs_set_str(handle, "ssid", ssid);
    nvs_set_str(handle, "pass", pass);
    err = nvs_commit(handle);
    nvs_close(handle);
    return err;
}

static void url_decode(char *dst, const char *src, size_t dst_size)
{
    size_t i = 0, j = 0;
    while (src[i] && j + 1 < dst_size) {
        if (src[i] == '+') {
            dst[j++] = ' ';
            i++;
        } else if (src[i] == '%' && src[i + 1] && src[i + 2]) {
            char hex[3] = { src[i + 1], src[i + 2], '\0' };
            dst[j++] = (char)strtol(hex, NULL, 16);
            i += 3;
        } else {
            dst[j++] = src[i++];
        }
    }
    dst[j] = '\0';
}

static esp_err_t setup_page_handler(httpd_req_t *req)
{
    wifi_scan_config_t scan_cfg = { .show_hidden = false };
    esp_wifi_scan_start(&scan_cfg, true);

    uint16_t ap_count = 0;
    esp_wifi_scan_get_ap_num(&ap_count);
    if (ap_count > 15) ap_count = 15;

    wifi_ap_record_t ap_list[15];
    esp_wifi_scan_get_ap_records(&ap_count, ap_list);

    char *html = malloc(4096);
    if (!html) return httpd_resp_send_500(req);

    int off = snprintf(html, 4096,
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<title>Easy Wi-Fi Setup</title>"
        "<style>body{font-family:sans-serif;background:#121212;color:#eee;max-width:400px;margin:40px auto;padding:16px}"
        "select,input,button{width:100%%;padding:10px;margin:8px 0;box-sizing:border-box;border-radius:6px;border:1px solid #444;background:#222;color:#fff}"
        "button{background:#0066cc;border:none;font-weight:bold;cursor:pointer}</style></head><body>"
        "<h2>Configurar Wi-Fi (EyeCam)</h2><form method='POST' action='/save'>"
        "<label>Rede 2.4 GHz:</label><select name='ssid'>");

    for (int i = 0; i < ap_count && off < 3400; i++) {
        off += snprintf(html + off, 4096 - off,
                        "<option value='%s'>%s (%d dBm)</option>",
                        (char *)ap_list[i].ssid, (char *)ap_list[i].ssid, ap_list[i].rssi);
    }

    snprintf(html + off, 4096 - off,
        "</select><label>Senha:</label><input type='password' name='pass' placeholder='Senha do Wi-Fi'>"
        "<button type='submit'>Salvar e Conectar</button></form></body></html>");

    httpd_resp_set_type(req, "text/html");
    esp_err_t res = httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
    free(html);
    return res;
}

static esp_err_t save_wifi_handler(httpd_req_t *req)
{
    char buf[256] = {0};
    int len = httpd_req_recv(req, buf, sizeof(buf) - 1);
    if (len <= 0) return httpd_resp_send_500(req);

    char raw_ssid[64] = {0}, raw_pass[64] = {0};
    char ssid[33] = {0}, pass[65] = {0};

    httpd_query_key_value(buf, "ssid", raw_ssid, sizeof(raw_ssid));
    httpd_query_key_value(buf, "pass", raw_pass, sizeof(raw_pass));

    url_decode(ssid, raw_ssid, sizeof(ssid));
    url_decode(pass, raw_pass, sizeof(pass));

    /* Configura a interface STA mantendo o AP ativo para testar e pegar o IP */
    wifi_config_t sta_cfg = {0};
    snprintf((char *)sta_cfg.sta.ssid, sizeof(sta_cfg.sta.ssid), "%s", ssid);
    snprintf((char *)sta_cfg.sta.password, sizeof(sta_cfg.sta.password), "%s", pass);

    xEventGroupClearBits(s_wifi_event_group, WIFI_CONNECTED_BIT | WIFI_FAIL_BIT);
    s_retry_num = 0;

    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &sta_cfg));
    esp_wifi_disconnect();
    esp_wifi_connect();

    /* Aguarda até 12 segundos pelo IP via DHCP do roteador/hotspot */
    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(12000));

    char page[768];
    if (bits & WIFI_CONNECTED_BIT) {
        save_wifi_credentials(ssid, pass);

        esp_netif_ip_info_t ip_info;
        esp_netif_t *sta_netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
        esp_netif_get_ip_info(sta_netif, &ip_info);

        uint8_t mac[6];
        esp_read_mac(mac, ESP_MAC_WIFI_STA);

        snprintf(page, sizeof(page),
            "<!doctype html><html><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1'>"
            "<style>body{font-family:sans-serif;background:#121212;color:#eee;text-align:center;padding:40px}"
            ".box{background:#1e1e1e;border:1px solid #333;border-radius:8px;padding:20px;max-width:420px;margin:auto}"
            "code{display:block;font-size:1.2em;color:#4ea8de;margin:10px 0}</style></head><body>"
            "<div class='box'><h3>Conectado em %s!</h3>"
            "<p>IP atribuído na rede:</p><code>http://" IPSTR "/stream</code>"
            "<p>Ou via mDNS:</p><code>http://eye-cam-%02x%02x.local/stream</code>"
            "<p style='color:#aaa;font-size:0.9em'>Reiniciando em modo câmera...</p></div></body></html>",
            ssid, IP2STR(&ip_info.ip), mac[4], mac[5]);

        httpd_resp_set_type(req, "text/html");
        httpd_resp_send(req, page, HTTPD_RESP_USE_STRLEN);

        vTaskDelay(pdMS_TO_TICKS(4000)); /* 4s para você ler ou copiar o IP antes do reboot */
        esp_restart();
        return ESP_OK;
    }

    /* Se a senha estiver errada ou falhar, avisa sem apagar a tela e mantém o portal aberto */
    snprintf(page, sizeof(page),
        "<!doctype html><html><head><meta charset='utf-8'>"
        "<style>body{font-family:sans-serif;background:#121212;color:#eee;text-align:center;padding:40px}"
        "a{color:#4ea8de}</style></head><body>"
        "<h3>Falha ao conectar em %s</h3>"
        "<p>Verifique a senha ou se a rede é 2.4 GHz.</p>"
        "<p><a href='/'>Voltar e tentar novamente</a></p></body></html>",
        ssid);

    httpd_resp_set_type(req, "text/html");
    httpd_resp_send(req, page, HTTPD_RESP_USE_STRLEN);
    return ESP_OK;
}

static void start_provisioning_ap(void)
{
    esp_netif_create_default_wifi_ap();

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, &instance_got_ip));

    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    char ap_ssid[32];
    snprintf(ap_ssid, sizeof(ap_ssid), "EyeCam-Setup-%02X%02X", mac[4], mac[5]);

    wifi_config_t ap_cfg = {
        .ap = {
            .channel = 6,
            .authmode = WIFI_AUTH_OPEN,
            .max_connection = 2,
        },
    };
    snprintf((char *)ap_cfg.ap.ssid, sizeof(ap_cfg.ap.ssid), "%s", ap_ssid);
    ap_cfg.ap.ssid_len = (uint8_t)strlen(ap_ssid);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_APSTA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_cfg));
    ESP_ERROR_CHECK(esp_wifi_start());

    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    httpd_handle_t server = NULL;
    if (httpd_start(&server, &config) == ESP_OK) {
        httpd_uri_t root_uri = { .uri = "/",     .method = HTTP_GET,  .handler = setup_page_handler };
        httpd_uri_t save_uri = { .uri = "/save", .method = HTTP_POST, .handler = save_wifi_handler  };
        httpd_register_uri_handler(server, &root_uri);
        httpd_register_uri_handler(server, &save_uri);
    }

    ESP_LOGW(TAG, "Modo Easy Wi-Fi ativo! Conecte-se no Wi-Fi '%s' e abra http://192.168.4.1", ap_ssid);

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}

/* ---- Wi-Fi STA com fallback para Easy Wi-Fi ----------------------------- */

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
    wifi_config_t cur_cfg;
    if (esp_wifi_get_config(WIFI_IF_STA, &cur_cfg) == ESP_OK && strlen((char *)cur_cfg.sta.ssid) > 0) {
        esp_wifi_connect();
    }
} else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGW(TAG, "Tentando conectar ao Wi-Fi (%d/%d)", s_retry_num, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Conectado! Abra http://" IPSTR "/stream", IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static esp_err_t init_wifi_sta(void)
{
    s_wifi_event_group = xEventGroupCreate();
    if (!s_wifi_event_group) return ESP_FAIL;

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    char saved_ssid[33] = {0};
    char saved_pass[65] = {0};

    if (!load_wifi_credentials(saved_ssid, sizeof(saved_ssid), saved_pass, sizeof(saved_pass))) {
        ESP_LOGW(TAG, "Nenhuma rede Wi-Fi salva. Abrindo portal Easy Wi-Fi...");
        start_provisioning_ap();
    }

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, &instance_got_ip));

    wifi_config_t wifi_config = {0};
    snprintf((char *)wifi_config.sta.ssid, sizeof(wifi_config.sta.ssid), "%s", saved_ssid);
    snprintf((char *)wifi_config.sta.password, sizeof(wifi_config.sta.password), "%s", saved_pass);

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(15000));

    if (bits & WIFI_CONNECTED_BIT) return ESP_OK;

    ESP_LOGW(TAG, "Falha ao conectar em '%s'. Voltando para o portal Easy Wi-Fi...", saved_ssid);
    esp_event_handler_instance_unregister(WIFI_EVENT, ESP_EVENT_ANY_ID, instance_any_id);
    esp_event_handler_instance_unregister(IP_EVENT, IP_EVENT_STA_GOT_IP, instance_got_ip);
    esp_wifi_stop();
    start_provisioning_ap();
    return ESP_FAIL;
}

/* ---- mDNS & Servidor HTTP do Stream ------------------------------------- */

static void start_mdns(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    char hostname[24];
    snprintf(hostname, sizeof(hostname), "eye-cam-%02x%02x", mac[4], mac[5]);

    if (mdns_init() != ESP_OK) {
        ESP_LOGW(TAG, "mDNS init failed");
        return;
    }
    mdns_hostname_set(hostname);
    mdns_instance_name_set("ESP32 camera stream");
    mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
    ESP_LOGI(TAG, "mDNS ready — http://%s.local/stream", hostname);
}

static esp_err_t index_handler(httpd_req_t *req)
{
    static const char html[] =
        "<!doctype html><html><head><meta charset=\"utf-8\">"
        "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">"
        "<title>Eye Camera (ESP32)</title></head>"
        "<body style=\"margin:0;background:#111\">"
        "<img src=\"/stream\" style=\"width:100%;max-width:960px;display:block;margin:auto\">"
        "</body></html>";
    httpd_resp_set_type(req, "text/html");
    return httpd_resp_send(req, html, HTTPD_RESP_USE_STRLEN);
}

static esp_err_t stream_handler(httpd_req_t *req)
{
    esp_err_t res = ESP_OK;
    char part_buf[64];
    uint32_t last_seq = 0;

    uint8_t *local_buf = heap_caps_malloc(UVC_MAX_FRAME_SIZE, buf_caps());
    if (!local_buf) {
        httpd_resp_send_err(req, HTTPD_500_INTERNAL_SERVER_ERROR, "Sem memória");
        return ESP_FAIL;
    }

    httpd_resp_set_hdr(req, "Cache-Control", "no-store, no-cache, must-revalidate, private");
    httpd_resp_set_hdr(req, "Pragma", "no-cache");
    httpd_resp_set_hdr(req, "Access-Control-Allow-Origin", "*");
    res = httpd_resp_set_type(req, "multipart/x-mixed-replace;boundary=frame");
    if (res != ESP_OK) {
        free(local_buf);
        return res;
    }

    while (true) {
        size_t jpg_len = 0;

        if (xSemaphoreTake(s_frame_mutex, pdMS_TO_TICKS(100)) == pdTRUE) {
            if (s_frame_seq != last_seq && s_latest_len > 0) {
                memcpy(local_buf, s_latest_buf, s_latest_len);
                jpg_len  = s_latest_len;
                last_seq = s_frame_seq;
            }
            xSemaphoreGive(s_frame_mutex);
        }

        if (jpg_len == 0) {
            vTaskDelay(pdMS_TO_TICKS(5));
            continue;
        }

        int hlen = snprintf(part_buf, sizeof(part_buf),
                            "--frame\r\nContent-Type: image/jpeg\r\nContent-Length: %u\r\n\r\n",
                            (unsigned int)jpg_len);

        res = httpd_resp_send_chunk(req, part_buf, hlen);
        if (res == ESP_OK) res = httpd_resp_send_chunk(req, (const char *)local_buf, jpg_len);
        if (res == ESP_OK) res = httpd_resp_send_chunk(req, "\r\n", 2);

        if (res != ESP_OK) break;
    }

    free(local_buf);
    ESP_LOGI(TAG, "Stream client disconnected");
    return res;
}

static void start_webserver(void)
{
    httpd_config_t config = HTTPD_DEFAULT_CONFIG();
    config.server_port = 80;
    httpd_handle_t server = NULL;

    if (httpd_start(&server, &config) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to start web server");
        return;
    }

    httpd_uri_t index_uri  = { .uri = "/",       .method = HTTP_GET, .handler = index_handler  };
    httpd_uri_t stream_uri = { .uri = "/stream", .method = HTTP_GET, .handler = stream_handler };
    httpd_register_uri_handler(server, &index_uri);
    httpd_register_uri_handler(server, &stream_uri);
    ESP_LOGI(TAG, "Web server started");
}

void app_main(void)
{
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    /* 1. Conecta no Wi-Fi salvo ou abre o portal Easy Wi-Fi em 192.168.4.1 */
    if (init_wifi_sta() != ESP_OK) return;

    /* 2. Inicia mDNS, servidor HTTP e só depois a câmera USB (Core 1) */
    start_mdns();
    start_webserver();

    if (init_camera() != ESP_OK) return;

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}