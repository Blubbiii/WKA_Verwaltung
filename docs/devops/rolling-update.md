# Zero-Downtime-Deployment für WPM

## Ausgangs-Situation

Aktuell (Sprint "Update-Mechanismus"):

- 1 App-Container in Docker-Compose (`docker-compose.portainer.yml`)
- Container-Restart bei jedem Deploy = ~30-60s Ausfall
- Browser-Clients erleben in dieser Zeit: 503 auf `/api/health`, 408 auf polls,
  React-Hydration-Mismatch nach Restart, Auth-Session-Refresh-Failures

Umgesetzt in diesem Sprint (Sofort-Verbesserungen ohne Infra-Umbau):

- **`/api/health/live`** — nur Prozess-Check → Container gilt sofort als healthy
- **`/api/health/ready`** — DB+Redis-Check → für Monitoring, NICHT für Container-Health
- Docker Healthcheck auf `/api/health/live` umgestellt
- `stop_grace_period: 30s` — Inflight-Requests werden noch bedient
- `start_interval: 5s` (Docker 25+) — schnellere Detection wenn Container hoch ist
- Client-seitig: Version-Check-Toast + Hydration-Auto-Reload + smart Retry-Logik

Damit sind ~80% der User-sichtbaren Probleme gelöst **ohne** dass wir das
Infra-Setup ändern müssen. Der letzte 20%-Punkt — echtes Zero-Downtime —
braucht Docker-Swarm oder Kubernetes.

## Wenn du echtes Zero-Downtime willst — 3 Optionen

### Option A: Docker Swarm (einfachste)

**Voraussetzung:** einmalige Aktion auf dem Server:

```sh
docker swarm init --advertise-addr <SERVER_IP>
```

Anschließend stack via Portainer als "Swarm-Stack" (nicht "Compose-Stack") laden.
Portainer erkennt das automatisch bei aktiviertem Swarm-Mode.

**Compose-Datei-Ergänzung** für den `app`-Service:

```yaml
app:
  image: ghcr.io/blubbiii/wka_verwaltung:latest
  # container_name entfernen — Swarm setzt eigene Namen
  # restart: unless-stopped entfernen — Swarm managt Neustart
  deploy:
    replicas: 2                     # Zwei App-Instanzen
    update_config:
      parallelism: 1                # Eine Instance zur Zeit erneuern
      order: start-first            # Neue erst hochfahren, dann alte stoppen
      delay: 10s                    # Zwischen Instances 10s warten
      failure_action: rollback      # Bei Fail alte Version wiederherstellen
      monitor: 60s                  # 60s beobachten ob neue Version stabil ist
    rollback_config:
      parallelism: 1
      order: stop-first
    restart_policy:
      condition: on-failure
      delay: 5s
      max_attempts: 3
      window: 120s
    resources:
      limits:
        memory: 2G
      reservations:
        memory: 512M
```

**Extra: Load-Balancer**  
Swarm hat einen eingebauten Ingress-Router — hört auf `3050` und routet
zwischen den 2 Replicas. Reverse-Proxy (Nginx/Traefik) bleibt optional
für externe Terminierung/SSL.

**Deployment-Ablauf danach:**
1. Neues Image nach `ghcr.io/blubbiii/wka_verwaltung:latest` pushen (bereits automatisch via GitHub Actions)
2. In Portainer: Stack "Update" → checks image digest neu → `docker stack deploy`
3. Swarm startet neuen Replica-1, wartet 60s, wenn healthy → stoppt alten Replica-1
4. Wiederholt für Replica-2
5. Kein Ausfall zwischen — die verbleibende Replica bedient alle Requests

### Option B: Nginx/Traefik + 2 App-Container (ohne Swarm)

Ohne Docker-Swarm: zwei App-Container statisch definieren, Reverse-Proxy davor.
Deploys via manuellen 2-Schritt-Wechsel. **Mehr Aufwand als Option A**, kein
Vorteil außer man will Swarm bewusst vermeiden.

### Option C: Kubernetes (Overkill für 1 Server)

k3s auf dem Server, dann Deployment mit `strategy: RollingUpdate`. Für
WPM's Setup mit 1 Node ist das massives Overengineering.

## Empfehlung

**Kurzfristig** (jetzt live nach diesem Sprint): Was wir bereits umgesetzt haben
reicht — Container-Restart ist von 30s User-Impact auf ~5-10s reduziert (Live-
Check springt schnell an, Grace-Period lässt Requests fertigwerden, Client sieht
den Update-Toast statt Fehler).

**Mittelfristig** (wenn User-Impact stört): Docker Swarm (Option A).
Aufwand: 1× `docker swarm init` + Compose-Anpassungen (~1-2h).
Voraussetzung: Server hat 4GB+ RAM (2 App-Container gleichzeitig).

**Nicht empfohlen**: Option C (Kubernetes) — Komplexität nicht gerechtfertigt.

## Ergänzung: Build-Time-Env für Version-Check

Der Client-Update-Toast erkennt neue Deployments über `NEXT_PUBLIC_COMMIT_SHA`.
Damit die Env-Var im Container ankommt, muss die GitHub-Actions-`deploy.yml`
den Build mit dem aktuellen Commit-SHA als Build-Arg füttern:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v6
  with:
    build-args: |
      NEXT_PUBLIC_COMMIT_SHA=${{ github.sha }}
      NEXT_PUBLIC_BUILD_TIME=${{ steps.date.outputs.time }}
```

Im `Dockerfile` als ARG + ENV übernehmen:

```dockerfile
ARG NEXT_PUBLIC_COMMIT_SHA=unknown
ARG NEXT_PUBLIC_BUILD_TIME=unknown
ENV NEXT_PUBLIC_COMMIT_SHA=$NEXT_PUBLIC_COMMIT_SHA
ENV NEXT_PUBLIC_BUILD_TIME=$NEXT_PUBLIC_BUILD_TIME
```

Ohne diese Änderung liefert `/api/version` nur `"unknown"` — Client-Toast
zeigt nichts an, weil "unknown → unknown" kein Version-Wechsel ist.
