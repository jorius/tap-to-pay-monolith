# Paynela

**Del cobro diario al crédito.** Paynela le da a los pequeños comercios un historial financiero verificable: cada venta que cobran y cada servicio que pagan a tiempo queda registrado, y con eso generan un **resumen de capacidad de pago** para pedir un crédito. Los cobros y pagos van de billetera a billetera con [Open Payments](https://openpayments.dev) sobre la red Interledger.

Proyecto de *Inteligencia Artesanal* para el Open Payments Hackathon, Ruta N, Medellín, octubre de 2026.

## El problema

Millones de tenderos, vendedores de plaza y pequeños negocios en Latinoamérica venden todos los días pero **no pueden demostrarlo**. Cobran en efectivo, no tienen extractos ni contabilidad formal, y para un banco no tienen historial. Por eso, cuando necesitan crédito, terminan en el "gota a gota", con intereses abusivos.

## La solución

1. **Cobrar digital, fácil y sin datáfono.** El comercio cobra con su celular: con un QR, con un link por WhatsApp o con un toque NFC. El cliente paga desde su billetera, incluso sin instalar la app. Cada venta queda registrada.
2. **Pagar sus servicios a tiempo, solos.** El comercio inscribe EPM, Claro, Tigo y otros servicios, y se pagan cada mes desde su billetera. Cada pago a tiempo suma a su historial de pagos.
3. **Demostrar capacidad de pago.** Con esos datos, Paynela genera un **resumen financiero mensual en PDF** con lo que mira una entidad de crédito:
   - ingreso mensual promedio y del mes más bajo, y su estabilidad;
   - obligaciones mensuales y su peso sobre los ingresos;
   - flujo neto mes a mes y capacidad de pago estimada;
   - puntualidad en los pagos.

   Cada resumen lleva un código de verificación.

## Qué hace

| Para el comercio | Para el cliente |
| --- | --- |
| **Resumen financiero en PDF** con su capacidad de pago de 6 meses, para pedir un crédito | Pagar escaneando un QR, abriendo un link o acercando el celular, incluso sin la app |
| **Pagos de servicios** (EPM, Claro, Tigo…) que se pagan solos cada mes y forman su historial | Dar permiso **una sola vez** a su billetera, con un tope diario |
| Cobrar con **QR**, **link por WhatsApp** o toque **NFC**, y ver sus ventas y movimientos | Topes por pago y por día que el servicio hace cumplir |
|  | Varias billeteras, incluso en monedas distintas |

## Cómo funciona

```
  Cobros (QR · link · NFC)      Pagos de servicios (cada mes)
            │                               │
            ▼                               ▼
   ┌─────────────────────────────────────────────────────┐
   │ Servicio Paynela (tap-to-pay-svc)                   │
   │ registra cada movimiento, aplica topes y firma cada │
   │ llamada a las billeteras con Open Payments          │
   └─────────────────────────────────────────────────────┘
            │                               │
            ▼                               ▼
   Billeteras (Interledger)      Resumen financiero en PDF
   el dinero va de billetera     ingresos, obligaciones y
   a billetera                   capacidad de pago, mes a mes
```

- **El dinero** nunca pasa por Paynela: va de billetera a billetera. Paynela registra lo que pidió y lo que las billeteras respondieron, y de ese registro sale el resumen.
- **Los celulares** no tienen llaves ni tokens. El servicio firma cada llamada y guarda el permiso que el cliente, o el comercio para sus servicios, dio una sola vez.

## Qué hay en el repositorio

| Carpeta o archivo | Qué es |
| --- | --- |
| [`tap-to-pay-svc/`](tap-to-pay-svc/) | El servicio: Express 5, TypeScript, Prisma 7 sobre PostgreSQL, SDK de Open Payments y tests con Vitest |
| [`tap-to-pay-app/`](tap-to-pay-app/) | La app móvil: Expo (React Native), con un módulo nativo en Kotlin para el NFC |
| [`SDD.md`](SDD.md) | El diseño completo: reglas, API, flujos, seguridad y decisiones |
| [`AI_USAGE.md`](AI_USAGE.md) y [`prompts/`](prompts/) | Cómo usamos IA y los prompts |

## Probarlo paso a paso

### 0. Lo que necesitas

- **Node.js 24** y **npm**.
- **Docker**, ya sea Docker Desktop o Colima (`brew install colima docker docker-compose`), para PostgreSQL.
- Una cuenta en la **Interledger Test Wallet**: https://wallet.interledger-test.dev. Usa dinero de prueba.
- **Para probar la app:**
  - **QR y link:** cualquier celular con **Expo Go** (iPhone o Android).
  - **NFC:** dos celulares **Android con NFC** y un build propio (ver el paso 5).

### 1. Crea las billeteras de prueba

En la Test Wallet:

1. Crea una dirección para el **cliente** y recárgala con dinero de prueba.
2. Crea una dirección para el **comercio**, en la **misma moneda**.
3. En una de ellas (por ejemplo, la del comercio), entra a *Developer Keys* y **genera una llave**. Descarga `private.key` y anota el **Key ID**: tiene forma de UUID, como `48aca863-…`. Esa dirección será la del servicio.
4. Opcional, para los pagos de servicios: crea una tercera dirección que hará de "EPM, Claro, Tigo".

### 2. Levanta el servicio

```bash
cd tap-to-pay-svc
npm install
cp .env.example .env               # y llénalo (tabla de abajo)
mv ~/Downloads/private.key .       # la llave del paso 1
docker compose up -d               # PostgreSQL en el puerto 55000
npx prisma migrate deploy          # crea las tablas
npm run db:generate                # genera el cliente de Prisma
npm run seed                       # crea el cliente y el comercio del .env
npm run dev                        # servicio en http://localhost:4000
```

Lo mínimo que hay que llenar en `.env`:

| Variable | Valor |
| --- | --- |
| `POSTGRES_PASSWORD` y `DATABASE_URL` | La misma contraseña en las dos: `postgresql://postgres:<contraseña>@localhost:55000/tap_to_pay` |
| `OP_CLIENT_WALLET_ADDRESS` | La dirección donde generaste la llave |
| `OP_KEY_ID` | El **Key ID** (el UUID), no la llave pública |
| `SEED_BUYER_NAME` y `SEED_BUYER_WALLET` | Nombre y dirección del cliente |
| `SEED_VENDOR_NAME` y `SEED_VENDOR_WALLET` | Nombre y dirección del comercio |
| `BILLERS_DEFAULT_WALLET` | Opcional: la tercera dirección, para los pagos de servicios |

Para comprobar que funciona: `curl localhost:4000/health` debe responder `"ok":true`.

### 3. Abre la app

```bash
cd tap-to-pay-app
npm install
cp .env.example .env
```

En `tap-to-pay-app/.env` pon la IP de tu computador, que obtienes con `ipconfig getifaddr en0` en Mac:

```
EXPO_PUBLIC_API_URL=http://<IP-de-tu-computador>:4000
```

Luego:

```bash
npx expo start --clear
```

Escanea el QR de la terminal con la cámara del iPhone o con Expo Go en Android. El celular tiene que estar **en el mismo Wi-Fi** que el computador.

### 4. Recorre el flujo: de vender a pedir un crédito

El recorrido completo es: el comercio **vende** (b, c, d), **paga sus servicios** (e) y **descarga su resumen financiero** (f). El resumen se arma con lo que se hizo en los pasos anteriores, así que entre más ventas y pagos, más completo sale.

En Expo Go, al abrir la app eliges el rol: **comercio** o **cliente**. Lo ideal son dos celulares, uno por rol. Con uno solo, recarga la app (tecla `r` en la terminal de Metro) para volver a elegir el rol.

**a. Dale permiso a la billetera del cliente (una sola vez).**
En la app, como cliente: *Cuenta → Mis billeteras → Permiso*. Eliges el tope diario y aceptas en la página de tu billetera.
Si la app no vuelve sola después de aceptar (pasa en Expo Go), usa el script desde `tap-to-pay-svc` y acepta en el navegador del computador:

```bash
npm run grant:buyer -- --buyer <dirección del cliente>
```

**b. Cobro con QR.** Funciona en Expo Go.
1. Comercio: *Cobrar*, escribe el monto, toca *Cobrar* y luego **Mostrar QR**.
2. Cliente: *Pagar → Pagar con QR o link*, escanea el código y toca *Pagar*.
3. El comercio ve **✓ Pagado**.

**c. Cobro por WhatsApp.**
1. Comercio: mientras el cobro espera, escribe el celular del cliente y toca **Enviar**. WhatsApp se abre con el mensaje listo.
2. El cliente abre el link: puede **pagar desde el navegador escribiendo su billetera**, sin la app, o copiar el código y pegarlo en *Pagar con QR o link*.

**d. Cobro con NFC (opcional).** Requiere dos Android con un build propio.
```bash
cd tap-to-pay-app
npx expo run:android --device "<nombre del celular>"   # uno por celular
```
El cliente activa su tarjeta en *Pagar*. El comercio cobra y el cliente acerca su celular a la parte de atrás del celular del comercio. Requisitos y diagnóstico de NFC: SDD, sección 14.

**e. Pagos de servicios del comercio: el historial de pagos.**
1. Comercio: *Más → Pagos de servicios → Añadir pago*. Elige EPM, Claro o Tigo, o *Otro servicio*, y escribe la referencia, el monto y el día del mes.
2. El comercio paga desde su propia billetera, así que necesita dar permiso una vez. La pantalla muestra el comando; córrelo en `tap-to-pay-svc`.
3. Toca **Pagar ahora**, o espera al día elegido: se paga solo a las 8:00 a. m.

**f. Resumen financiero en PDF: el resultado para pedir un crédito.**
Comercio: *Más → Mi historial de negocio*. Elige el mes y descarga el PDF:
- **Hoja 1, capacidad de pago de 6 meses:** ingresos, estabilidad, obligaciones, flujo neto y pagos al día.
- **Hoja 2, ventas del mes.**

### 5. Corre los tests

```bash
cd tap-to-pay-svc && npm run typecheck && npm test
cd tap-to-pay-app && npx tsc --noEmit && npm run lint
```

## Problemas comunes

| Síntoma | Causa y solución |
| --- | --- |
| `EADDRINUSE` al correr `npm run dev` | Ya hay otro servicio en el puerto 4000. Detenlo (`lsof -i :4000`) y vuelve a correrlo |
| `invalid_client` o *"could not determine client"* | `OP_KEY_ID` tiene la llave pública en vez del **Key ID** (UUID), o `private.key` no corresponde a esa dirección |
| `P1000: Authentication failed` | La contraseña de `DATABASE_URL` no coincide con la de `POSTGRES_PASSWORD` con la que se creó la base |
| `P1001: Can't reach database` | PostgreSQL está apagado. Corre `colima start` (si usas Colima) y `docker compose up -d` |
| La app dice *"sin conexión"* | `EXPO_PUBLIC_API_URL` apunta a otra IP o a `localhost`. Corrígela y reinicia con `npx expo start --clear` |
| *"Ninguna de tus billeteras autoriza pagos"* | Falta el permiso del paso 4a |
| Los servicios dicen *"Sin billetera configurada"* | Falta `BILLERS_DEFAULT_WALLET` en el `.env` del servicio |
| Safari dice que la dirección `paynela://…` no es válida | En Expo Go la app no tiene ese esquema. Paga desde la página del link o copia el código |
| *Cannot find native module 'NfcTap'* | Expo Go no trae el módulo NFC. Para el toque usa un build (`npx expo run:android`) |

## Más información

- **Diseño completo**, con reglas, API, flujos, seguridad y atajos conocidos: [`SDD.md`](SDD.md).
- **Uso de IA:** [`AI_USAGE.md`](AI_USAGE.md) y [`prompts/`](prompts/).

> **Proyecto de hackathon.** La API no tiene autenticación y el permiso de la billetera se guarda sin cifrar. La sección 11 del SDD lista cada atajo y cuándo quitarlo. Usa solo billeteras de prueba.
