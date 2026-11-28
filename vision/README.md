# vision

Processamento offline das sessões: pega os vídeos gravados pelas duas câmeras,
estima pra onde o paciente está olhando e decide se bate com a posição do
objeto. Roda à parte do dashboard (Next.js) — os dois só se falam por HTTP,
no fim do pipeline.

```
capture/    grava os streams MJPEG das câmeras em vídeo, durante a sessão
gaze/       roda o iCatcher+ sobre o vídeo do olho -> rótulo de olhar por frame
mapping/    rótulo de olhar + posição do objeto na cena -> "olhando pro objeto?"
pipeline/   orquestra as três etapas acima e envia o resultado pro dashboard
data/       vídeos, templates e arquivos intermediários (gitignored)
```

## Fluxo de uma sessão

1. Durante a gravação, `capture.SessionRecorder` salva `eye.mp4` e `scene.mp4`
   em `data/sessions/<session_id>/`.
2. Depois que a sessão termina, `pipeline/run_session.py process <session_id>` roda:
   - `gaze.icatcher_adapter` no `eye.mp4` → lista de (tempo, rótulo de olhar).
   - `mapping.target_zone` no `scene.mp4` → posição do objeto por frame,
     usando template matching multi-escala (porta do `plate_tracker.py` do
     repositório `joaovpavan/child-eye-tracking`, MIT) a partir de uma foto
     de referência do objeto em `data/templates/`.
   - `mapping.gaze_mapper` combina rótulo de olhar + posição do objeto →
     série de `(timeSeconds, objectPosition, eyePosition)`.
   - `pipeline.api_client` loga como médica e envia essa série pro dashboard
     via `POST /api/sessions/{id}/finish` (mesma rota que o frontend já usa).

Nada aqui decide se o resultado é "saudável" ou "sinalizado" — isso continua
em aberto, como já decidido pro resto do projeto. O pipeline só mede e manda
os dados brutos.

## Setup local

```bash
python -m venv .venv
.venv/Scripts/activate   # ou source .venv/bin/activate no Linux/Mac
pip install -r requirements-dev.txt   # inclui requirements.txt + pytest
```

O iCatcher+ também precisa do `ffmpeg` instalado e visível no PATH.

Pra testar com vídeo real ou ao vivo com o ESP32, veja [`TESTING.md`](TESTING.md).

## Testes

```bash
pytest
```

Cobre `calibration`, o parser do iCatcher+, o rastreamento do objeto (com
vídeo sintético, sem precisar de câmera de verdade), o `gaze_mapper`, o
cliente de API (mockado, não chama o dashboard de verdade) e a orquestração
do `run_session`.

Configure o `.env` (copie de `.env.example`) com a URL do dashboard e um
login de médica pro pipeline conseguir mandar o resultado.

## Rodando

```bash
# 1. grava a sessão (roda durante a gravação em si)
python -m pipeline.run_session record <session_id> --eye-url http://<ip-camera-olho>/stream --scene-url http://<ip-camera-cena>/stream --duration 60

# 2. processa o vídeo gravado e manda o resultado pro dashboard
python -m pipeline.run_session process <session_id> --template data/templates/<objeto>.jpg
```

O template é só uma foto de referência do objeto usado na sessão (recortada,
sem fundo demais), salva uma vez em `data/templates/`.

Tudo roda na máquina local — nada sobe pra nuvem ainda.
