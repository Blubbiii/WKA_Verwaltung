# Deployment Guide: WindparkManager (WPM)

## Voraussetzungen

### Server-Anforderungen
- **OS**: Ubuntu 22.04 LTS oder Debian 12
- **CPU**: 4+ Cores
- **RAM**: 8+ GB
- **Storage**: 100+ GB SSD
- **Docker**: 24.0+
- **Docker Compose**: 2.20+

### Domain & DNS
- Domain für die Anwendung (z.B. `wpm.example.com`)
- DNS A-Record zeigt auf Server-IP
- Optional: Subdomain für Storage (`storage.wpm.example.com`)

## Quick Start

### 1. Server vorbereiten

```bash
# System aktualisieren
sudo apt update && sudo apt upgrade -y

# Docker installieren
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Docker Compose installieren (falls nicht enthalten)
sudo apt install docker-compose-plugin

# Neuanmeldung für Docker-Gruppe
newgrp docker
```

### 2. Projekt klonen

```bash
# Projektverzeichnis erstellen
mkdir -p /opt/windparkmanager
cd /opt/windparkmanager

# Repository klonen (oder Dateien kopieren)
git clone https://github.com/your-org/windparkmanager.git .
```

### 3. Umgebungsvariablen konfigurieren

```bash
# .env Datei erstellen
cp .env.example .env

# Datei bearbeiten
nano .env
```

**Wichtige Einstellungen:**

```env
# Domain
APP_DOMAIN=wpm.example.com

# Sichere Passwörter generieren
POSTGRES_PASSWORD=$(openssl rand -base64 32)
REDIS_PASSWORD=$(openssl rand -base64 32)
NEXTAUTH_SECRET=$(openssl rand -base64 32)
MINIO_ROOT_PASSWORD=$(openssl rand -base64 32)

# E-Mail für SSL-Zertifikate
ACME_EMAIL=admin@example.com
```

### 4. Anwendung starten

```bash
# Container bauen und starten
docker compose up -d

# Logs prüfen
docker compose logs -f app
```

### 5. Erste Einrichtung

```bash
# Datenbank initialisieren (falls nicht automatisch)
docker compose exec app npm run db:migrate

# Superadmin erstellen
docker compose exec app npm run create-admin
```

## Detaillierte Konfiguration

### SSL/TLS mit Let's Encrypt

Traefik holt automatisch SSL-Zertifikate. Voraussetzungen:
- Port 80 und 443 offen
- DNS zeigt auf Server
- ACME_EMAIL konfiguriert

```bash
# SSL-Status prüfen
docker compose exec traefik cat /letsencrypt/acme.json
```

### Datenbank-Zugriff

```bash
# PostgreSQL CLI
docker compose exec db psql -U wpm -d windparkmanager

# Datenbank-Dump erstellen
docker compose exec db pg_dump -U wpm windparkmanager > backup.sql

# Dump importieren
docker compose exec -T db psql -U wpm windparkmanager < backup.sql
```

### MinIO (S3 Storage) einrichten

```bash
# MinIO Console öffnen (Port 9001)
# https://storage.wpm.example.com

# Bucket erstellen
docker compose exec minio mc alias set local http://localhost:9000 minioadmin $MINIO_ROOT_PASSWORD
docker compose exec minio mc mb local/wpm-documents
docker compose exec minio mc policy set download local/wpm-documents
```

### E-Mail-Konfiguration testen

```bash
# Test-E-Mail senden
docker compose exec app npm run test-email
```

## Backup-Strategie

### Automatische Backups

Der `backup`-Container erstellt täglich Datenbank-Backups:

```
/opt/windparkmanager/backups/
├── daily/
│   ├── windparkmanager-20260125-020000.sql.gz
│   └── ...
├── weekly/
└── monthly/
```

### Manuelles Backup

```bash
# Vollständiges Backup (DB + Dateien)
./scripts/backup.sh

# Backup-Inhalt
# - PostgreSQL Dump
# - MinIO Daten
# - .env Konfiguration
```

### Backup-Skript

```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/opt/backups/wpm/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Datenbank
docker compose exec -T db pg_dump -U wpm windparkmanager | gzip > $BACKUP_DIR/db.sql.gz

# MinIO Daten
docker compose exec minio mc mirror local/wpm-documents $BACKUP_DIR/files/

# Konfiguration
cp .env $BACKUP_DIR/

# Komprimieren
tar -czf $BACKUP_DIR.tar.gz -C /opt/backups/wpm $(basename $BACKUP_DIR)
rm -rf $BACKUP_DIR

echo "Backup erstellt: $BACKUP_DIR.tar.gz"
```

### Restore

```bash
#!/bin/bash
# scripts/restore.sh BACKUP_FILE

BACKUP_FILE=$1
TEMP_DIR="/tmp/wpm-restore"

# Entpacken
mkdir -p $TEMP_DIR
tar -xzf $BACKUP_FILE -C $TEMP_DIR

# Datenbank wiederherstellen
gunzip -c $TEMP_DIR/*/db.sql.gz | docker compose exec -T db psql -U wpm windparkmanager

# MinIO Daten wiederherstellen
docker compose exec minio mc mirror $TEMP_DIR/*/files/ local/wpm-documents

# Aufräumen
rm -rf $TEMP_DIR
```

## Monitoring

### Health Checks

```bash
# Anwendung
curl -f https://wpm.example.com/api/health

# Datenbank
docker compose exec db pg_isready -U wpm

# Redis
docker compose exec redis redis-cli ping
```

### Logs

```bash
# Alle Logs
docker compose logs -f

# Nur App-Logs
docker compose logs -f app

# Nur Fehler
docker compose logs -f app 2>&1 | grep -i error
```

### Prometheus Metrics (optional)

```yaml
# docker-compose.override.yml
services:
  prometheus:
    image: prom/prometheus:latest
    volumes:
      - ./prometheus.yml:/etc/prometheus/prometheus.yml
    ports:
      - "9090:9090"
    networks:
      - wpm-network

  grafana:
    image: grafana/grafana:latest
    volumes:
      - grafana_data:/var/lib/grafana
    ports:
      - "3001:3000"
    networks:
      - wpm-network
```

## Updates

### Anwendung aktualisieren

```bash
# Neueste Version holen
git pull origin main

# Container neu bauen
docker compose build app

# Mit minimaler Downtime aktualisieren
docker compose up -d --no-deps app

# Migrationen ausführen (falls nötig)
docker compose exec app npm run db:migrate
```

### Zero-Downtime Deployment

```bash
# Blue-Green Deployment
docker compose -f docker-compose.blue-green.yml up -d app-new
# Testen...
docker compose -f docker-compose.blue-green.yml stop app-old
```

## Sicherheit

### Firewall (UFW)

```bash
# Nur benötigte Ports öffnen
sudo ufw allow 22/tcp   # SSH
sudo ufw allow 80/tcp   # HTTP
sudo ufw allow 443/tcp  # HTTPS
sudo ufw enable
```

### Fail2Ban

```bash
sudo apt install fail2ban

# Konfiguration für Traefik-Logs
cat > /etc/fail2ban/jail.d/traefik.conf << EOF
[traefik-auth]
enabled = true
filter = traefik-auth
logpath = /var/log/traefik/access.log
maxretry = 5
bantime = 3600
EOF
```

### Regelmäßige Updates

```bash
# System-Updates automatisieren
sudo apt install unattended-upgrades
sudo dpkg-reconfigure unattended-upgrades
```

## Troubleshooting

### Container startet nicht

```bash
# Logs prüfen
docker compose logs app

# Container-Status
docker compose ps

# Ressourcen prüfen
docker stats
```

### Datenbank-Verbindungsfehler

```bash
# Verbindung testen
docker compose exec app nc -zv db 5432

# PostgreSQL-Logs
docker compose logs db
```

### SSL-Zertifikat-Probleme

```bash
# Zertifikat-Status
docker compose exec traefik cat /letsencrypt/acme.json | jq

# Traefik-Logs
docker compose logs traefik | grep -i acme
```

### Speicherplatz voll

```bash
# Docker aufräumen
docker system prune -a --volumes

# Alte Backups löschen
find /opt/backups -mtime +30 -delete
```

## Skalierung

### Horizontal (mehrere App-Instanzen)

```yaml
# docker-compose.override.yml
services:
  app:
    deploy:
      replicas: 3
```

### Vertikal (mehr Ressourcen)

```yaml
# docker-compose.override.yml
services:
  app:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 4G
```

### Externe Datenbank

Für Produktion empfohlen: Managed PostgreSQL (z.B. Supabase, AWS RDS)

```env
DATABASE_URL=postgresql://user:pass@external-db.example.com:5432/windparkmanager
```

## Checkliste für Produktion

- [ ] Sichere Passwörter für alle Services
- [ ] SSL/TLS aktiviert
- [ ] Backups konfiguriert und getestet
- [ ] Monitoring eingerichtet
- [ ] Firewall konfiguriert
- [ ] Fail2Ban aktiviert
- [ ] E-Mail-Versand getestet
- [ ] Health Checks funktionieren
- [ ] Logging funktioniert
- [ ] Update-Prozess dokumentiert
