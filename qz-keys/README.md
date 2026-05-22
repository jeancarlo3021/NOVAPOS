# QZ Tray - Certificado Auto-Firmado

Estos archivos permiten que QZ Tray confíe en NovaPOS sin necesidad de popup de permisos en cada visita.

## Archivos

- **`override.crt`** → Certificado público (va en C:\Program Files\QZ Tray\auth\)
- **`private-key.pem`** → Llave privada (se guarda en localStorage del navegador)

## Instalación en otra computadora

### 1. Copiar certificado a QZ Tray

1. Copia `override.crt` de esta carpeta
2. Pégalo en: `C:\Program Files\QZ Tray\auth\override.crt`
   - Si la carpeta `auth` no existe, créala
   - Te pedirá permisos de administrador — acepta

### 2. Reiniciar QZ Tray

1. Click derecho en el ícono de QZ Tray (bandeja del sistema)
2. Click en **Exit**
3. Abre QZ Tray nuevamente desde el menú de inicio

### 3. Guardar llave privada en localStorage

En la consola del navegador (F12) dentro de NovaPOS:

```javascript
localStorage.setItem('qz_private_key', `-----BEGIN PRIVATE KEY-----
MIIEvAIBADANBgkqhkiG9w0BAQEFAASCBKYwggSiAgEAAoIBAQDKGU6TEF/ANq9a
w5jQyioz4fzMIn5YD16QZN/t5u5rR8ULcABP985Mhvnp055Agtt6f0P+7v0FIxQ/
WimgMFHTjh6m2DjKbCoYEekz2w0v1R42jq1Ues3IdgotSydRxaRv3fuhPYWqIr+m
T9waqJHyz/BbZKm1XQsu3Vwjb5JL1G+wqdO9V0oBShGHI2wZxly32GAu83l4N4NF
AAC5cOdUnm2LxE6Xzl+nTew7HJXRijp+47laeq6Pv3BNtHbz2Lv0toN4llSez/7w
l7isPmLUleD6URvXhnIBpliBRX2O1UHdVIPTFArAt45DZBjbe6eKsHUTQgpdXT4q
OLiMTCfZAgMBAAECggEAFtWUqeuh8fELz4zFjaOl8I5CVps4HMGBzP1Eyte6jP8D
LbdmJaLpWX6vqoJ5QS831qed+mYsyuGLhlvs05daC3XlkzLfecmOWQFfELeZjhO9
ker9fQvSB+oEXNk+tE/JNEWHypBNs6sw7bzcsNtmgCGL9fuR7Da6znz+zdcrl6sR
wYm1TkwpfibkFw4epKRRO9mdnMoMH9Eekb7TBbLK/9WIkDrCvnb52R7YtPAoL53D
VZZGTq0FYsVlJnO5eG4FnMVpy0NeV7a5YI74o7ZE+hWMtkphXILeRTWdiIikYt8S
JfjgXPpZjbTTUZ7q/lXAYcR3ewXaBIZakEcFR3b9HQKBgQDyZZxXZnJOep4AgUmi
Y4mveeb+rAKBQPpsKYrCHHheo2GgYNPAAnEojqYN65D0e7T+yczdMSHbNXmgmHu8
VqtgnntH4Qne7n+L8wSCoeVRxYAHsDGUHkAzc9kOrqEdsYjpiVLnwSLUCoceE5F1
kDNNkLvJzzKk2p06D1iSpnKJ3QKBgQDVcMFPkWaVnPDXBVeZRFKDdJb76A9e0Gc6
tEfDk+2KrzsuGYM7NoQJsNYzjnIsB8L2owwhAWnDkaF09etm3ZpljS7ucASlo0c0
4UzQmUGPPGiqVkxQP1aWXXlActPGqAhDPMx4CsLXpyVQTeSCAmd3wE+9zkB4fJMe
5xeDh3DcLQKBgCH7pOOL9VKTVjtz5MLjeZYkXQIvU1qTpYgsesuj+iwqc7FsYcN1
lC+/cABbmkLsZP+jgxkvnjOBV7/wIMjSzcwJ6/az0hJzFWald2hpEiFYsw5g4VKG
uzF7eF7alLP5A9zZ58meBif8Id1RmP8GbGrfc7RjXBJIo+pT5HMK6tvxAoGARorJ
mR6ZJQGFp8sgNIucKc4yyHbd/ZwrQf+raDxP2fIoQQg1kzBlWz6SzN9bZKn8Cb/B
lnb9GaHcFufgMVM0YDPVOwDSyFu6gQOle5vrSwfQH9v9xNfqKjAijuZkj9ehQ3eo
rFQCKXwYnP3hdAaPY8ivki/Epw2lIiWGY/YzmtECgYBQz1j0G1WiWRXwzQW/UMtU
dRm5+HJgPS4KgvkSxs6dtS2tlbjc4IoJEWB9bp33Ji9o8sOroWdt8ye/yAjLpArk
qjy9lUkLpnIlW5VFdaPGYXuypp8WsjfFRLMwy47e8pscEntf9cVTHdcfWBSOuJlj
3JqoBTlSNqZM3Kj8FxHUtw==
-----END PRIVATE KEY-----`);
console.log('✅ Llave guardada');
```

### 4. Probar

Recarga la página (`Ctrl+Shift+R`) y ejecuta:

```javascript
await window.qz.websocket.connect();
const printers = await window.qz.printers.find();
console.log('✅ Impresoras:', printers);
```

No debe aparecer popup y las impresoras deberían listarse automáticamente.

## Seguridad

⚠️ **IMPORTANTE:**
- Estos archivos contienen claves criptográficas
- Guárdalos en un lugar seguro (no en el repo público)
- Si se filtran, regenera nuevos en https://qz.io
- El certificado es válido por 10 años (vence 2036-05-19)

## Soporte

Si necesitas regenerar las llaves:
```bash
openssl genrsa -out private-key.pem 2048
openssl pkcs8 -topk8 -inform PEM -outform PEM -in private-key.pem -out private-key-pkcs8.pem -nocrypt
openssl req -new -x509 -key private-key.pem -out override.crt -days 3650 \
  -subj "/CN=NovaPOS/O=NovaPOS/C=CR"
```
