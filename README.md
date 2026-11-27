# NeuroEYE — Sistema Binocular de Rastreamento Ocular de Baixo Custo

Plataforma aberta de **eye-tracking** (rastreamento ocular) e captura de cena baseada em **ESP32-S3** e webcams **USB UVC**, projetada para aquisição binocular sem fio, sincronização de quadros em tempo real e análise pupilar em computador.

> **Autores:** Gabrieli Jorge Barbosa, Luan Gabriel e Nycollas Moretz Sohn Goncalves Ramos da Silva · **Licença:** MIT License

---

## Visão Geral e Objetivos

O **NeuroEYE** nasceu com o objetivo de oferecer uma alternativa acessível, modular e reprodutível aos sistemas comerciais de rastreamento ocular. A arquitetura desacopla a captura embarcada do processamento pesado:

- **Captura embarcada leve e sem fio:** dois módulos **ESP32-S3** montados na estrutura dos óculos capturam o fluxo de vídeo do olho e do campo de visão (cena), transmitindo os quadros em MJPEG via Wi-Fi com descoberta automática por mDNS.
- **Sincronização e processamento no PC:** o computador recebe os dois fluxos independentes, realiza o emparelhamento temporal dos quadros e executa os algoritmos de detecção de pupila, calibração e visualização.
- **Hardware reprodutível:** estrutura mecânica modelada para impressão 3D e eletrônica baseada em módulos comerciais de fácil acesso.

---

## Modelo 3D e Estrutura Mecânica

[![Estrutura 3D dos Óculos NeuroEYE](docs/imagens/preview_3d_oculos.png)](Hardware/3D/oculos_neuroeye.stl)

> **Visualização interativa:** clique na imagem acima para abrir o arquivo `.stl` no visualizador 3D nativo do GitHub (com rotação e zoom), ou acesse a pasta [`Hardware/3D/`](Hardware/3D/) para baixar todas as peças para impressão.

---

## Arquitetura do Sistema

```mermaid
flowchart LR
    subgraph Óculos [Módulo Vestível — Óculos 3D]
        C1[Câmera Olho<br/>USB UVC] --> E1[ESP32-S3 #1<br/>eye-cam-XXXX.local]
        C2[Câmera Cena<br/>USB UVC] --> E2[ESP32-S3 #2<br/>eye-cam-YYYY.local]
    end

    E1 -- "Wi-Fi / HTTP MJPEG" --> PC
    E2 -- "Wi-Fi / HTTP MJPEG" --> PC

    subgraph Estação [Processamento — PC]
        PC[Sincronização &<br/>Detecção de Pupila] --> UI[Interface Web /<br/>Visualização]
    end
