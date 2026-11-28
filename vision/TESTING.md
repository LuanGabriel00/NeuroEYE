# Testando com vídeo real e ao vivo com o ESP32

Guia rápido pra testar o pipeline sem depender de mais ninguém. Pressupõe
que `vision/.venv` já está criado e com `requirements-dev.txt` instalado
(veja o README.md).

## 1. Testar com um vídeo real que você já tem (sem hardware ligado)

### Só o olho (iCatcher+)

```bash
cd vision
.venv/Scripts/python scripts/try_icatcher.py "C:\caminho\para\video_do_olho.mp4"
```

Mostra quantos frames caíram em cada rótulo (`left`, `right`, `away`,
`noface`, `nobabyface`, `none`). Se a maioria for `noface`/`nobabyface`, o
rosto não está sendo detectado no vídeo (câmera longe demais, ângulo ruim,
iluminação) — não é bug do código, é o vídeo em si.

### Só o objeto (rastreamento na cena)

Precisa de uma foto de referência do objeto (recortada, o mais "só o
objeto" possível, sem muito fundo — tira um print de um frame do próprio
vídeo e recorta):

```bash
.venv/Scripts/python scripts/try_target_zone.py "C:\caminho\para\video_da_cena.mp4" --template "C:\caminho\para\foto_do_objeto.jpg"
```

Mostra em quantos frames achou o objeto e a posição inicial/final (-1 a 1).
Se "Objeto encontrado em 0/N frames": o template não está batendo — tenta
recortar mais justo, ou tirar a foto em condição de luz mais parecida com a
do vídeo.

### Com os dois juntos, igual vai rodar de verdade

Se já tiver os dois vídeos de uma sessão de teste, só renomeia pra
`eye.mp4` e `scene.mp4` e põe em `vision/data/sessions/<qualquer_nome>/`,
depois roda:

```bash
.venv/Scripts/python -m pipeline.run_session process <qualquer_nome> --template "C:\caminho\para\foto_do_objeto.jpg"
```

**Atenção:** esse comando no final tenta mandar o resultado pro dashboard
(login + `POST /api/sessions/.../finish`) — pra isso o Next.js
(`npm run dev` dentro de `frontend/`) e o Postgres precisam estar rodando,
e o `.env` da `vision/` (copiado de `.env.example`) precisa ter um login de
médica válido. Se só quiser testar o processamento (gaze + objeto) sem
mandar pro dashboard, use os dois scripts separados acima — eles não
dependem do dashboard.

## 2. Testar ao vivo com as placas ESP32

### Como a rede funciona (resumo do `Firmware/README.md`)

- As placas **não** criam uma rede Wi-Fi própria pro streaming — isso só
  acontece na primeira configuração (`EyeCam-Setup-XXXX`, pra você digitar
  a senha do Wi-Fi de casa/laboratório). Depois disso, cada placa entra na
  **mesma rede Wi-Fi que o seu PC**.
- Cada placa se anuncia por **mDNS** com um nome fixo:
  `http://eye-cam-XXXX.local/stream` (o `XXXX` vem do MAC de cada placa —
  vai ser diferente pra cada uma das duas).
- O nome aparece no log serial (`idf.py monitor`) quando a placa liga:
  `mDNS ready — http://eye-cam-a004.local/stream`. Se não tiver acesso ao
  log, dá pra achar o IP na lista de dispositivos conectados do roteador.
- **Windows resolve `.local` nativamente**, não precisa instalar nada (isso
  só é problema no Linux).

### Passo a passo

1. Liga as duas placas, espera conectarem na rede (LED ou log serial
   confirmando).
2. Testa cada uma **individualmente antes de tudo**:
   ```bash
   .venv/Scripts/python scripts/check_camera.py http://eye-cam-XXXX.local/stream
   ```
   Troca `XXXX` pelo nome de cada placa. Se falhar, tenta o IP direto em
   vez do `.local`.
3. **Importante, limitação real do firmware:** cada placa só aceita **um
   cliente por vez** no `/stream`. Se você abriu a câmera no navegador pra
   testar, feche a aba antes de rodar o `check_camera.py` ou o
   `run_session.py` — senão fica "carregando" pra sempre e parece bug.
4. Com as duas confirmadas, grava uma sessão de teste:
   ```bash
   .venv/Scripts/python -m pipeline.run_session record teste1 --eye-url http://eye-cam-AAAA.local/stream --scene-url http://eye-cam-BBBB.local/stream --duration 30
   ```
   Isso salva `eye.mp4` e `scene.mp4` em `data/sessions/teste1/`. Qual placa
   é qual (olho vs. cena) depende de qual você apontou pra onde
   fisicamente — o nome mDNS não diz isso, só vocês sabem pela montagem.
5. Depois, processa exatamente como no vídeo real (seção 1): primeiro com
   os scripts separados (`try_icatcher.py` / `try_target_zone.py`) pra
   validar que a captura ao vivo deu um vídeo utilizável, e só depois com o
   `pipeline.run_session process` se quiser já mandar pro dashboard.

### Problemas mais prováveis (na ordem mais comum)

| Sintoma | O que fazer |
|---|---|
| `check_camera.py` falha pro nome `.local` | Tenta o IP direto (vê no roteador ou no log serial) |
| Grava mas o vídeo sai preto/corrompido | Outro cliente (navegador, outra instância do script) ainda conectado na mesma placa — fecha tudo e tenta de novo |
| iCatcher só dá `noface` | Vídeo do olho não é um rosto reconhecível nessa distância/ângulo — ajusta a posição física da câmera, não é bug |
| Rastreamento do objeto não acha nada | Template não bate com a aparência real na cena — recorta mais justo ou tira foto nas mesmas condições de luz |
