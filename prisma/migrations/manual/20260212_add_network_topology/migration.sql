-- CreateTable: NetworkNode (Netz-Topologie Knoten)
CREATE TABLE "network_nodes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "parkId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "posX" DOUBLE PRECISION NOT NULL,
    "posY" DOUBLE PRECISION NOT NULL,
    "turbineId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable: NetworkConnection (Netz-Topologie Verbindungen)
CREATE TABLE "network_connections" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fromNodeId" TEXT NOT NULL,
    "toNodeId" TEXT NOT NULL,
    "cableType" TEXT,
    "lengthM" DOUBLE PRECISION,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "network_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "network_nodes_tenantId_parkId_idx" ON "network_nodes"("tenantId", "parkId");

-- CreateIndex
CREATE INDEX "network_connections_tenantId_idx" ON "network_connections"("tenantId");

-- CreateIndex
CREATE INDEX "network_connections_fromNodeId_idx" ON "network_connections"("fromNodeId");

-- CreateIndex
CREATE INDEX "network_connections_toNodeId_idx" ON "network_connections"("toNodeId");

-- AddForeignKey
ALTER TABLE "network_nodes" ADD CONSTRAINT "network_nodes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_nodes" ADD CONSTRAINT "network_nodes_parkId_fkey" FOREIGN KEY ("parkId") REFERENCES "parks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_nodes" ADD CONSTRAINT "network_nodes_turbineId_fkey" FOREIGN KEY ("turbineId") REFERENCES "turbines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_connections" ADD CONSTRAINT "network_connections_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_connections" ADD CONSTRAINT "network_connections_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "network_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "network_connections" ADD CONSTRAINT "network_connections_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "network_nodes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
