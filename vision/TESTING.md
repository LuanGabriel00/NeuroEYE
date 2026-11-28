# Testando com vídeo real e ao vivo com o ESP32

Guia completo pra testar o pipeline sozinho, sem depender de mais ninguém.

## 0. Setup (se ainda não tiver feito)

```bash
cd vision
python -m venv .venv
.venv/Scripts/activate              # Windows. No Linux/Mac: source .venv/bin/activate
pip install -r requirements-dev.txt # inclui requirements.txt + pytest
```

- Precisa também do **ffmpeg** instalado e no PATH (o iCatcher+ usa ele por
  baixo). Confere com `ffmpeg -version`.
- Copia `.env.example` pra `.env` dentro de `vision/` e preenche:
  ```
  NEUROEYE_API_URL=http://localhost:3000
  NEUROEYE_EMAIL=<email de uma médica já cadastrada>
  NEUROEYE_PASSWORD=<senha dela>
  ```
  Só precisa disso se for usar `pipeline.run_session process` (que manda o
  resultado pro dashboard). Os scripts de teste manual (seção 1) não usam
  o `.env`.

**Atenção, isso é importante pra amanhã:** na **primeira vez** que o
iCatcher+ roda, ele baixa sozinho um pacote de modelo com **~2 GB**
(demora alguns minutos, depende da internet). Isso só acontece uma vez —
ele fica em cache (`%LOCALAPPDATA%\icatcher_plus\...` no Windows) — mas
**precisa ter internet nessa primeira vez**. Se for testar num lugar sem
internet, roda o `try_icatcher.py` com qualquer vídeo curto antes, só pra
forçar esse download enquanto ainda tem conexão.

## 1. Testar com um vídeo real que você já tem (sem hardware ligado)

Sempre a partir de dentro de `vision/`, com o venv (pode usar
`.venv/Scripts/python`, não precisa ativar o venv se não quiser).

### 1.1. Só o olho (iCatcher+)

```bash
.venv/Scripts/python scripts/try_icatcher.py "C:\caminho\para\video_do_olho.mp4"
```

Mostra quantos frames caíram em cada rótulo: `left`, `right`, `away`,
`noface`, `nobabyface`, `none`. Se a maioria for `noface`/`nobabyface`, o
rosto não está sendo detectado no vídeo (câmera longe demais, ângulo ruim,
iluminação) — **não é bug do código**, é o vídeo em si.

Use `--fps` se quiser forçar o fps manualmente (por padrão ele detecta
sozinho lendo o próprio arquivo de vídeo).

### 1.2. Só o objeto (rastreamento na cena)

**Como funciona:** template matching (código do João, porta de
`joaovpavan/child-eye-tracking`, `postprocessing/plate_tracker.py`, MIT) —
procura uma foto de referência do objeto em cada frame, em 10 escalas
diferentes, sem nenhum treino. Isso significa:

- Precisa ser **sempre o mesmo objeto físico** usado na sessão. Trocou de
  objeto → precisa de template novo, o antigo não serve mais.
- Lida bem com o objeto **mudando de escala e indo de um lado pro outro**
  (o caso de vocês). **Não lida com o objeto girando** — o template
  matching só reconhece mudança de posição/tamanho, não de ângulo.
- Templates ficam em `vision/data/templates/`, um arquivo de imagem por
  objeto (ex: `bolinha.jpg`). Não tem seleção automática — você passa o
  caminho certo em `--template` toda vez.

**Pra gerar o template:** tira um print de um frame do próprio vídeo da
cena e recorta só o objeto (o mínimo de fundo possível), numa condição de
luz parecida com a da sessão de verdade. Qualquer editor de imagem serve.

```bash
.venv/Scripts/python scripts/try_target_zone.py "C:\caminho\para\video_da_cena.mp4" --template "C:\caminho\para\foto_do_objeto.jpg"
```

Mostra em quantos frames achou o objeto e a posição inicial/final (-1 a
1). Se sair **"Objeto encontrado em 0/N frames"**: o template não está
batendo — recorta mais justo, ou tira a foto em luz mais parecida com a
do vídeo.

### 1.3. Os dois juntos, processando como uma sessão de verdade

Se já tiver os dois vídeos de um teste, renomeia pra `eye.mp4` e
`scene.mp4` e põe os dois dentro de `vision/data/sessions/<id>/` (você
escolhe o `<id>`, é só o nome da pasta):

```bash
.venv/Scripts/python -m pipeline.run_session process <id> --template "C:\caminho\para\foto_do_objeto.jpg"
```

**Isso só funciona de ponta a ponta se `<id>` for uma sessão que realmente
existe no banco do dashboard** — veja a seção 2. Se você inventar um id
qualquer, o processamento (iCatcher + rastreamento do objeto) roda normal,
mas no final dá erro **"Sessão não encontrada"**, porque o
`POST /api/sessions/{id}/finish` exige que a sessão já exista. Pra testar
só o processamento, sem se preocupar com isso, use os scripts separados da
1.1/1.2 em vez do `run_session process`.

Pra isso funcionar também precisa, rodando ao mesmo tempo: o Next.js
(`npm run dev` dentro de `frontend/`) e o Postgres, e o `.env` da `vision/`
com um login de médica válido (seção 0).

### 1.4. Ver o resultado combinado sem precisar do dashboard

O `process` da seção 1.3 sempre tenta mandar o resultado pro dashboard. Se
você só quer **ver** o resultado final (os pontos de `tempo, posição do
objeto, posição do olho` que iriam pro gráfico do dashboard), sem precisar
do Next.js nem do Postgres rodando, use o `results`:

```bash
.venv/Scripts/python -m pipeline.run_session results <id> --template "C:\caminho\para\foto_do_objeto.jpg" --plot
```

Isso salva, dentro de `data/sessions/<id>/`:

- `tracking_points.csv` — a série completa, uma linha por ponto
  (`time_seconds, object_position, eye_position`), pra abrir no Excel ou
  inspecionar na mão.
- `tracking_points.png` (só se passar `--plot`) — um gráfico com as duas
  curvas (objeto e olho) ao longo do tempo, igual o que o dashboard
  mostra. Precisa do `matplotlib` (já vem se instalou
  `requirements-dev.txt`).

E imprime no terminal um resumo: quantos pontos, duração, e a diferença
média entre a posição do objeto e a do olho (0 = perfeitamente alinhado;
isso é só uma medida bruta, **não** é um veredito de "normal"/"anormal").

Se der **"Nenhum ponto calculado"**: ou o iCatcher não reconheceu rosto em
nenhum frame do vídeo do olho, ou o rastreamento do objeto não achou o
template em nenhum frame da cena — os mesmos problemas da seção 1.1/1.2,
só que vistos depois de combinados.

## 2. Conseguir um `session_id` real (pra mandar pro dashboard de verdade)

O jeito mais simples é pelo próprio dashboard no navegador: cria um
paciente, clica em "Iniciar Gravação" pra abrir uma sessão nova, e pega o
id dela na URL ou no banco (`npx prisma studio` dentro de `frontend/`
mostra a tabela `sessions`).

Se preferir por linha de comando (sem abrir o navegador), com o Next.js
rodando em `http://localhost:3000`:

```bash
# 1. login (guarda o cookie de sessão em cookies.txt)
curl -c cookies.txt -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<email>","password":"<senha>"}'

# 2. lista os pacientes já cadastrados, pra pegar um id
curl -b cookies.txt http://localhost:3000/api/patients

# (se não tiver nenhum paciente ainda, cria um:)
curl -b cookies.txt -X POST http://localhost:3000/api/patients \
  -H "Content-Type: application/json" \
  -d '{"name":"Teste","birthDate":"2025-01-01","gender":"OUTRO","guardianName":"Responsavel Teste","guardianContact":"11999999999"}'

# 3. abre uma sessão pro paciente escolhido - o "id" que volta aqui é o session_id
curl -b cookies.txt -X POST http://localhost:3000/api/patients/<patientId>/sessions
```

O `id` que vem na resposta do passo 3 é o que você usa em
`pipeline.run_session process <session_id> ...`.

## 3. Testar ao vivo com as placas ESP32

### 3.1. Como a rede funciona (resumo do `Firmware/README.md`)

- As placas **não** criam uma rede Wi-Fi própria pro streaming — isso só
  acontece na primeira configuração (`EyeCam-Setup-XXXX`, rede aberta, pra
  você digitar a senha do Wi-Fi de casa/laboratório pelo celular ou PC em
  `http://192.168.4.1`). Depois disso, cada placa entra na **mesma rede
  Wi-Fi que o seu PC** e pega um IP normal por DHCP.
- Cada placa se anuncia por **mDNS** com um nome fixo baseado no MAC dela:
  `http://eye-cam-XXXX.local/stream` (o `XXXX` é diferente em cada
  placa — vocês têm duas, uma pro olho e outra pra cena).
- O nome e o IP aparecem no log serial quando a placa liga:
  `mDNS ready — http://eye-cam-a004.local/stream`. Sem acesso ao log, dá
  pra achar o IP na lista de dispositivos conectados do roteador.
- **Windows resolve `.local` nativamente**, não precisa instalar nada
  (isso só dá trabalho no Linux).
- Só funciona em Wi-Fi **2,4 GHz** (o ESP32-S3 não faz 5 GHz).

### 3.2. Passo a passo

1. Liga as duas placas, espera conectarem na rede (log serial ou, na
   falta dele, confirma que aparecem na lista de dispositivos do
   roteador).
2. Testa cada uma **individualmente antes de tudo**:
   ```bash
   .venv/Scripts/python scripts/check_camera.py http://eye-cam-XXXX.local/stream
   ```
   Troca `XXXX` pelo nome de cada placa (uma de cada vez). Se o `.local`
   falhar, tenta o IP direto.
3. **Importante, limitação real do firmware:** cada placa só aceita **um
   cliente por vez** no `/stream`. Se você abriu a câmera no navegador pra
   olhar, **fecha a aba antes** de rodar `check_camera.py` ou
   `run_session.py` nessa mesma placa — senão fica "carregando" pra
   sempre e parece bug, mas não é.
4. Com as duas confirmadas, grava uma sessão de teste (o `<id>` aqui é só
   o nome da pasta local; se quiser já mandar pro dashboard depois, use um
   `<id>` real conseguido na seção 2):
   ```bash
   .venv/Scripts/python -m pipeline.run_session record <id> --eye-url http://eye-cam-AAAA.local/stream --scene-url http://eye-cam-BBBB.local/stream --duration 30
   ```
   Isso salva `eye.mp4` e `scene.mp4` em `data/sessions/<id>/`. Qual placa
   é qual (olho vs. cena) depende de qual vocês apontaram pra onde
   fisicamente — o nome mDNS não diz isso, só vocês sabem pela montagem.
5. Processa igual à seção 1: primeiro com `try_icatcher.py` /
   `try_target_zone.py` separados pra confirmar que a captura ao vivo deu
   um vídeo utilizável, e só depois com `pipeline.run_session process` se
   quiser já mandar pro dashboard (precisa do `<id>` real, seção 2).

## 3.3. Sincronização entre as duas câmeras

As duas placas são independentes e o Wi-Fi varia a latência de cada uma de
um jeito diferente — então gravar os dois vídeos assumindo um fps fixo
deixaria o vídeo do olho e o da cena saindo de sincronia ao longo da
sessão (pior quanto mais longa for a gravação). O firmware **não** envia
nenhum sinal de sincronização hoje (o README do `Firmware/` menciona um
cabeçalho `X-Timestamp` opcional, mas ele não está implementado no
`main.c` ainda).

Por isso a sincronização é feita inteiramente no lado do PC, sem precisar
mexer no firmware: `capture.SessionRecorder` anota o **horário real de
chegada** de cada frame (não assume fps constante), com as duas câmeras
compartilhando a mesma origem de relógio desde o instante em que a
gravação começa. Isso gera, ao lado de cada vídeo, um
`eye.timestamps.csv` / `scene.timestamps.csv`. Na hora de processar, tanto
o iCatcher+ quanto o rastreamento do objeto usam esse horário real em vez
do fps — então mesmo que uma câmera tenha entregado frames mais devagar
que a outra em algum trecho, a comparação "olhando pro objeto ou não"
continua certa.

Isso só existe pra gravação **ao vivo** (`pipeline.run_session record`).
Testando com um vídeo já pronto (seção 1), não tem esse arquivo — o
código cai de volta pro cálculo por fps, que é bom o suficiente pra um
vídeo só, sem o problema das duas câmeras divergindo uma da outra.

## 4. Avisos técnicos que vão poupar tempo de debug

- **OpenCV 5.x (o que o iCatcher+ instalou) removeu o tracker CSRT.** O
  `target_zone.py` já lida com isso sozinho (cai pro tracker `MIL`) — se
  algum dia aparecer um erro tipo `AttributeError: ... TrackerCSRT`, é
  sinal de que alguém reinstalou uma lib diferente, não é esperado.
- **Não force `--fd_model opencv_dnn` na mão** se for chamar `icatcher`
  direto pela linha de comando pra debugar algo: essa opção usa
  `cv2.dnn.readNetFromCaffe`, que esse OpenCV também não tem mais, e
  quebra. O adapter (`gaze/icatcher_adapter.py`) não usa essa flag, então
  o pipeline normal não é afetado.
- `requirements.txt` é só o necessário pra rodar; `requirements-dev.txt`
  adiciona o `pytest`. `pip install -r requirements-dev.txt` já cobre os
  dois.

## 5. Tabela de problemas mais prováveis

| Sintoma | Causa provável / o que fazer |
|---|---|
| `check_camera.py` falha pro nome `.local` | Tenta o IP direto (vê no roteador ou no log serial) |
| Grava mas o vídeo sai vazio/corrompido | Outro cliente (navegador, outra instância do script) ainda conectado na mesma placa — fecha tudo e tenta de novo |
| Primeira execução do iCatcher+ demora muito / parece travada | Normal na primeira vez: baixando ~2 GB de modelo. Precisa de internet. Depois disso fica em cache |
| iCatcher só dá `noface`/`nobabyface` | Vídeo do olho não mostra um rosto reconhecível nessa distância/ângulo — ajusta a posição física da câmera, não é bug de código |
| Rastreamento do objeto não acha nada | Template não bate com a aparência real na cena — recorta mais justo ou tira a foto em condição de luz parecida |
| `pipeline.run_session process` termina com "Sessão não encontrada" | O `session_id` usado não existe no banco do dashboard — veja a seção 2 pra conseguir um id real |
| `ModuleNotFoundError` rodando qualquer script | Esqueceu de instalar `requirements-dev.txt` nesse venv, ou está usando outro Python que não o `.venv` |
