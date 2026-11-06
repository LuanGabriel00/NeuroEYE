/**
 * Eye-facing ESP32 camera stream over Wi-Fi (MJPEG).
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

#ifndef portTICK_RATE_MS
#define portTICK_RATE_MS portTICK_PERIOD_MS
#endif

static const char *TAG = "eye:stream";

#if defined(CONFIG_WIFI_ROLE_STA)
#define WIFI_SSID CONFIG_WIFI_SSID
#define WIFI_PASS CONFIG_WIFI_PASSWORD
#endif

#define WIFI_CONNECTED_BIT BIT0
#define WIFI_FAIL_BIT      BIT1
#define WIFI_MAX_RETRY     10

static EventGroupHandle_t s_wifi_event_group;
static int s_retry_num = 0;

/* ---- Rede (modo STA): ajuste para a sua rede ---------------------------- */

#define NET_O1   192          /* os três primeiros números da sua rede */
#define NET_O2   168
#define NET_O3   0
#define GW_HOST  1            /* último número do IP do roteador */

/* MAC -> último número do IP. Troque pelos MACs reais das suas placas
 * (o MAC aparece no log de boot: "MAC: xx:xx:xx:xx:xx:xx").
 * Placa fora da tabela usa DHCP. */
static const struct {
    uint8_t mac[6];
    uint8_t host;
} k_boards[] = {
    { {0x40, 0x42, 0x00, 0x46, 0x40, 0x40}, 50 },   /* ESP 1 */
    { {0xe0, 0x72, 0xa1, 0xd9, 0xa0, 0x04}, 51 },   /* ESP 2 */
};

static int s_host = -1;   /* IP estático escolhido (-1 = DHCP) */

/* ---- Configuração da câmera USB ----------------------------------------- */

#define UVC_WIDTH           800
#define UVC_HEIGHT          480
#define UVC_FPS             20
#define UVC_MAX_FRAME_SIZE  (256 * 1024)   /* tamanho máximo de um frame MJPEG */

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

/* Chamado pelo driver UVC a cada frame. Só copia e retorna (não bloqueia). */
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
    return true;  /* devolve o buffer ao driver imediatamente */
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
        ESP_LOGW(TAG, "Overflow de frame buffer (aumente UVC_MAX_FRAME_SIZE ou reduza resolução)");
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
            .frame_size              = 0,   /* automático */
            .frame_heap_caps         = buf_caps(),
            .number_of_urbs          = 3,
            .urb_size                = 10 * 1024,
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

/* Task que mantém a câmera aberta e reconecta se for desplugada/replugada. */
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
    xTaskCreate(usb_lib_task, "usb_lib", 4096, NULL, 10, NULL);

    const uvc_host_driver_config_t driver_config = {
        .driver_task_stack_size = 4096,
        .driver_task_priority   = 9,
        .xCoreID                = 0,
        .create_background_task = true,
    };
    ESP_ERROR_CHECK(uvc_host_install(&driver_config));

    xTaskCreate(uvc_manager_task, "uvc_mgr", 4096, NULL, 5, NULL);
    return ESP_OK;
}

/* ---- Wi-Fi STA ---------------------------------------------------------- */

#if defined(CONFIG_WIFI_ROLE_STA)

static int lookup_host_octet(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);
    ESP_LOGI(TAG, "MAC: %02x:%02x:%02x:%02x:%02x:%02x",
             mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);
    for (size_t i = 0; i < sizeof(k_boards) / sizeof(k_boards[0]); i++) {
        if (memcmp(mac, k_boards[i].mac, 6) == 0) return k_boards[i].host;
    }
    return -1;   /* não encontrado: usa DHCP */
}

static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data)
{
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        if (s_retry_num < WIFI_MAX_RETRY) {
            esp_wifi_connect();
            s_retry_num++;
            ESP_LOGW(TAG, "Retrying Wi-Fi (%d/%d)", s_retry_num, WIFI_MAX_RETRY);
        } else {
            xEventGroupSetBits(s_wifi_event_group, WIFI_FAIL_BIT);
        }
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_CONNECTED) {
        /* Com IP estático o GOT_IP pode não disparar; aqui garantimos o sinal. */
        if (s_host > 0) {
            ESP_LOGI(TAG, "Associado ao AP. Open http://%d.%d.%d.%d",
                     NET_O1, NET_O2, NET_O3, s_host);
            s_retry_num = 0;
            xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
        }
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Connected. Open http://" IPSTR, IP2STR(&event->ip_info.ip));
        s_retry_num = 0;
        xEventGroupSetBits(s_wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static esp_err_t init_wifi_sta(void)
{
    s_wifi_event_group = xEventGroupCreate();
    if (!s_wifi_event_group) {
        ESP_LOGE(TAG, "Failed to create Wi-Fi event group");
        return ESP_FAIL;
    }

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_t *netif = esp_netif_create_default_wifi_sta();

    s_host = lookup_host_octet();
    if (s_host > 0) {
        ESP_ERROR_CHECK(esp_netif_dhcpc_stop(netif));

        esp_netif_ip_info_t ip_info = {};
        ip_info.ip.addr      = ESP_IP4TOADDR(NET_O1, NET_O2, NET_O3, s_host);
        ip_info.gw.addr      = ESP_IP4TOADDR(NET_O1, NET_O2, NET_O3, GW_HOST);
        ip_info.netmask.addr = ESP_IP4TOADDR(255, 255, 255, 0);
        ESP_ERROR_CHECK(esp_netif_set_ip_info(netif, &ip_info));

        esp_netif_dns_info_t dns = {};
        dns.ip.u_addr.ip4.addr = ESP_IP4TOADDR(NET_O1, NET_O2, NET_O3, GW_HOST);
        dns.ip.type = ESP_IPADDR_TYPE_V4;
        ESP_ERROR_CHECK(esp_netif_set_dns_info(netif, ESP_NETIF_DNS_MAIN, &dns));

        ESP_LOGI(TAG, "IP estático: %d.%d.%d.%d", NET_O1, NET_O2, NET_O3, s_host);
    } else {
        ESP_LOGW(TAG, "MAC fora da tabela, usando DHCP");
    }

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        WIFI_EVENT, ESP_EVENT_ANY_ID, &wifi_event_handler, NULL, &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(
        IP_EVENT, IP_EVENT_STA_GOT_IP, &wifi_event_handler, NULL, &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = { .ssid = WIFI_SSID, .password = WIFI_PASS },
    };

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    EventBits_t bits = xEventGroupWaitBits(s_wifi_event_group,
                                           WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
                                           pdFALSE, pdFALSE,
                                           pdMS_TO_TICKS(20000));

    if (bits & WIFI_CONNECTED_BIT) return ESP_OK;

    if (bits & WIFI_FAIL_BIT) {
        ESP_LOGE(TAG, "Wi-Fi authentication failed for SSID: %s", WIFI_SSID);
    } else {
        ESP_LOGE(TAG, "Wi-Fi connection timed out for SSID: %s", WIFI_SSID);
    }
    vEventGroupDelete(s_wifi_event_group);
    return ESP_FAIL;
}

#endif /* CONFIG_WIFI_ROLE_STA */

/* ---- Wi-Fi AP ----------------------------------------------------------- */

#if defined(CONFIG_WIFI_ROLE_AP)

static esp_err_t init_wifi_ap(void)
{
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_ap();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    const char *ssid = CONFIG_AP_SSID;
    const char *pass = CONFIG_AP_PASSWORD;

    wifi_config_t ap_config = {};
    strncpy((char *)ap_config.ap.ssid, ssid, sizeof(ap_config.ap.ssid) - 1);
    ap_config.ap.ssid_len     = (uint8_t)strlen(ssid);
    strncpy((char *)ap_config.ap.password, pass, sizeof(ap_config.ap.password) - 1);
    ap_config.ap.max_connection = CONFIG_AP_MAX_CONN;
    ap_config.ap.authmode       = (strlen(pass) >= 8) ? WIFI_AUTH_WPA2_PSK : WIFI_AUTH_OPEN;

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_AP));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_AP, &ap_config));
    ESP_ERROR_CHECK(esp_wifi_set_ps(WIFI_PS_NONE));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "AP started — SSID: \"%s\" | IP: 192.168.4.1", ssid);
    return ESP_OK;
}

#endif /* CONFIG_WIFI_ROLE_AP */

/* ---- mDNS --------------------------------------------------------------- */

static void start_mdns(void)
{
    uint8_t mac[6];
    esp_read_mac(mac, ESP_MAC_WIFI_STA);

    char hostname[24];
#if defined(CONFIG_WIFI_ROLE_AP)
    snprintf(hostname, sizeof(hostname), "forward-cam-%02x%02x", mac[4], mac[5]);
#else
    snprintf(hostname, sizeof(hostname), "eye-cam-%02x%02x", mac[4], mac[5]);
#endif

    if (mdns_init() != ESP_OK) {
        ESP_LOGW(TAG, "mDNS init failed");
        return;
    }
    mdns_hostname_set(hostname);
    mdns_instance_name_set("ESP32 camera stream");
    mdns_service_add(NULL, "_http", "_tcp", 80, NULL, 0);
    ESP_LOGI(TAG, "mDNS ready — http://%s.local/stream", hostname);
}

/* ---- HTTP handlers ------------------------------------------------------ */

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

    /* Cada cliente tem sua cópia local do frame, para não segurar o mutex
     * durante o envio pela rede (isso travaria o callback USB). */
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
            vTaskDelay(pdMS_TO_TICKS(5));   /* aguarda novo frame */
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

    if (init_camera() != ESP_OK) return;

#if defined(CONFIG_WIFI_ROLE_AP)
    if (init_wifi_ap() != ESP_OK) return;
#else
    if (init_wifi_sta() != ESP_OK) return;
#endif

    start_mdns();
    start_webserver();

    while (1) {
        vTaskDelay(pdMS_TO_TICKS(1000));
    }
}
