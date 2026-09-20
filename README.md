# Controle de Pátio

Aplicativo para registrar e acompanhar a localização de motoristas por QR Code nos pontos de Estacionamento/Espera e Doca.

## Primeira versão

- Painel administrativo responsivo
- Indicadores de ocupação e permanência
- Busca por placa, motorista ou localização
- Fluxo mobile de leitura/confirmação por QR Code
- Estrutura preparada para Firebase Authentication e Firestore

## QR Codes

Use os endereços publicados com os parâmetros:

- `?local=Estacionamento%20%2F%20Espera`
- `?local=Doca%20de%20carga%20e%20descarga`

## Firebase

Copie `.env.example` para `.env.local` e preencha as chaves do projeto Firebase. O arquivo `src/firebase.js` ativa automaticamente Authentication e Firestore quando as variáveis estão presentes.
