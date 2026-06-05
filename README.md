# Showpool

**EN** | [ES](#es)

Crowdfunding platform for live events. Users commit to attending a show and set the maximum price they're willing to pay. A clearing algorithm dynamically finds the minimum viable ticket price — confirming shows only when enough people have committed and the economics work.

## How it works

The algorithm tries to confirm as many shows as possible for a given artist tour. For N confirmed shows, it calculates a revenue target per show based on the artist fee schedule, production costs, and profit margin. Each show then independently finds its clearing price: the lowest price at which enough attendees cover the target revenue. If all N shows are viable at that price, the event is confirmed. Otherwise it tries N-1, and so on.

## Stack

- **Frontend:** React + Vite, deployed on AWS S3 + CloudFront
- **Backend:** Node.js + Express, deployed on GCP Cloud Run
- **Database:** PostgreSQL on AWS RDS

## Live

- Frontend: [https://d2tpsl5r7s8d07.cloudfront.net](https://d2tpsl5r7s8d07.cloudfront.net)
- Backend API: [https://showpool-backend-656157652493.us-east1.run.app](https://showpool-backend-656157652493.us-east1.run.app)

## Local development

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # fill in DATABASE_URL
npm install
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` to `http://localhost:3001`.

### Environment variables

`backend/.env`:
```
DATABASE_URL=postgresql://user:password@host:5432/showpool
```

`frontend/.env.production`:
```
VITE_API_BASE=https://your-backend.run.app
```

## Deploy

**Backend (GCP Cloud Run):**
```bash
cd backend
docker build -t gcr.io/PROJECT/showpool-backend .
docker push gcr.io/PROJECT/showpool-backend
gcloud run deploy showpool-backend --image gcr.io/PROJECT/showpool-backend --region us-east1
```

**Frontend (AWS S3):**
```bash
cd frontend
npm run build
aws s3 sync dist s3://your-bucket --delete
```

---

<a name="es"></a>

# Showpool — ES

Plataforma de crowdfunding para eventos en vivo. Los usuarios se comprometen a asistir a un show y establecen el precio máximo que están dispuestos a pagar. Un algoritmo de clearing encuentra dinámicamente el precio mínimo viable — confirmando los shows solo cuando hay suficientes comprometidos y los números funcionan.

## Cómo funciona

El algoritmo intenta confirmar la mayor cantidad posible de shows para una gira. Para N shows confirmados, calcula un objetivo de ingresos por show basándose en el cachet del artista, los costos de producción y el margen de ganancia. Cada show encuentra independientemente su precio de clearing: el precio más bajo al que suficientes asistentes cubren el objetivo de ingresos. Si todos los N shows son viables a ese precio, el evento se confirma. Si no, prueba con N-1, y así.

## Stack

- **Frontend:** React + Vite, deployado en AWS S3 + CloudFront
- **Backend:** Node.js + Express, deployado en GCP Cloud Run
- **Base de datos:** PostgreSQL en AWS RDS

## En vivo

- Frontend: [https://d2tpsl5r7s8d07.cloudfront.net](https://d2tpsl5r7s8d07.cloudfront.net)
- Backend API: [https://showpool-backend-656157652493.us-east1.run.app](https://showpool-backend-656157652493.us-east1.run.app)

## Desarrollo local

```bash
# Terminal 1 — backend
cd backend
cp .env.example .env   # completar DATABASE_URL
npm install
npm run dev

# Terminal 2 — frontend
cd frontend
npm install
npm run dev
```

El frontend corre en `http://localhost:5173` y tiene proxy de `/api` hacia `http://localhost:3001`.

### Variables de entorno

`backend/.env`:
```
DATABASE_URL=postgresql://usuario:contraseña@host:5432/showpool
```

`frontend/.env.production`:
```
VITE_API_BASE=https://tu-backend.run.app
```

## Deploy

**Backend (GCP Cloud Run):**
```bash
cd backend
docker build -t gcr.io/PROYECTO/showpool-backend .
docker push gcr.io/PROYECTO/showpool-backend
gcloud run deploy showpool-backend --image gcr.io/PROYECTO/showpool-backend --region us-east1
```

**Frontend (AWS S3):**
```bash
cd frontend
npm run build
aws s3 sync dist s3://tu-bucket --delete
```
