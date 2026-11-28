import argparse
import time

import requests


def main():
    parser = argparse.ArgumentParser(description="Testa se um stream MJPEG de uma placa ESP32 está acessível.")
    parser.add_argument("url", help="Ex.: http://eye-cam-a004.local/stream")
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()

    print(f"Conectando em {args.url} ...")
    start = time.monotonic()
    try:
        with requests.get(args.url, stream=True, timeout=args.timeout) as r:
            r.raise_for_status()
            received = 0
            for chunk in r.iter_content(chunk_size=4096):
                received += len(chunk)
                if received > 20_000 or time.monotonic() - start > args.timeout:
                    break
        print(f"OK - recebi {received} bytes em {time.monotonic() - start:.1f}s. O stream está de pé.")
    except requests.exceptions.RequestException as e:
        print(f"FALHOU: {e}")
        print(
            "Causas comuns: nome .local não resolve (tenta o IP direto, vide log de boot da placa), "
            "outro cliente já conectado no /stream dessa placa (o ESP só atende 1 por vez - feche outras "
            "abas/scripts), placa fora da rede ou desligada."
        )


if __name__ == "__main__":
    main()
