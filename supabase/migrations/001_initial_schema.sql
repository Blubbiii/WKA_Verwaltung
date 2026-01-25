-- =====================================================
-- WindparkManager (WPM) - Initial Database Schema
-- PostgreSQL with Row Level Security
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================================
-- ENUM TYPES
-- =====================================================

CREATE TYPE user_role AS ENUM ('superadmin', 'admin', 'manager', 'viewer');
CREATE TYPE contract_type AS ENUM ('lease', 'service', 'insurance', 'grid_connection', 'marketing');
CREATE TYPE contract_status AS ENUM ('draft', 'active', 'expiring', 'expired', 'terminated');
CREATE TYPE invoice_type AS ENUM ('invoice', 'credit_note');
CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'paid', 'cancelled');
CREATE TYPE vote_status AS ENUM ('draft', 'active', 'closed');
CREATE TYPE document_category AS ENUM ('contract', 'protocol', 'report', 'invoice', 'permit', 'correspondence', 'other');
CREATE TYPE notification_type AS ENUM ('document', 'vote', 'contract', 'invoice', 'system');
CREATE TYPE audit_action AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'EXPORT', 'LOGIN', 'IMPERSONATE');

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Tenants (Mandanten)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color VARCHAR(7) DEFAULT '#1e40af',
    secondary_color VARCHAR(7) DEFAULT '#3b82f6',
    settings JSONB DEFAULT '{}',
    contact_email VARCHAR(255),
    contact_phone VARCHAR(50),
    address TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users (extends Supabase auth.users)
CREATE TABLE users (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    full_name VARCHAR(255),
    role user_role DEFAULT 'viewer',
    avatar_url TEXT,
    settings JSONB DEFAULT '{}',
    last_login_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);

-- =====================================================
-- PARK & TURBINE MANAGEMENT
-- =====================================================

-- Wind Parks
CREATE TABLE parks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(50),
    address TEXT,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    commissioning_date DATE,
    decommissioning_date DATE,
    operator VARCHAR(255),
    owner VARCHAR(255),
    total_capacity_kw DECIMAL(12, 2),
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_parks_tenant ON parks(tenant_id);

-- Wind Turbines (Anlagen)
CREATE TABLE turbines (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    park_id UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
    designation VARCHAR(100) NOT NULL,
    serial_number VARCHAR(100),
    manufacturer VARCHAR(255),
    model VARCHAR(255),
    rated_power_kw DECIMAL(10, 2),
    hub_height_m DECIMAL(6, 2),
    rotor_diameter_m DECIMAL(6, 2),
    commissioning_date DATE,
    warranty_end_date DATE,
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    status VARCHAR(50) DEFAULT 'active',
    technical_data JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_turbines_tenant ON turbines(tenant_id);
CREATE INDEX idx_turbines_park ON turbines(park_id);

-- Service Events
CREATE TABLE service_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    turbine_id UUID NOT NULL REFERENCES turbines(id) ON DELETE CASCADE,
    event_date DATE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    description TEXT,
    duration_hours DECIMAL(6, 2),
    cost DECIMAL(12, 2),
    performed_by VARCHAR(255),
    documents JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_service_events_tenant ON service_events(tenant_id);
CREATE INDEX idx_service_events_turbine ON service_events(turbine_id);
CREATE INDEX idx_service_events_date ON service_events(event_date);

-- =====================================================
-- FUND & SHAREHOLDER MANAGEMENT
-- =====================================================

-- Funds (Fonds/Gesellschaften)
CREATE TABLE funds (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    legal_form VARCHAR(100),
    registration_number VARCHAR(100),
    registration_court VARCHAR(255),
    founding_date DATE,
    fiscal_year_end VARCHAR(10) DEFAULT '12-31',
    total_capital DECIMAL(15, 2),
    managing_director VARCHAR(255),
    address TEXT,
    bank_details JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_funds_tenant ON funds(tenant_id);

-- Fund-Park Relationship
CREATE TABLE fund_parks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    park_id UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
    ownership_percentage DECIMAL(5, 2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(fund_id, park_id)
);

-- Persons (Kontakte, Verpächter, etc.)
CREATE TABLE persons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    person_type VARCHAR(50) DEFAULT 'natural', -- natural, legal
    salutation VARCHAR(50),
    first_name VARCHAR(255),
    last_name VARCHAR(255),
    company_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(50),
    mobile VARCHAR(50),
    address_street VARCHAR(255),
    address_zip VARCHAR(20),
    address_city VARCHAR(100),
    address_country VARCHAR(100) DEFAULT 'Deutschland',
    tax_id VARCHAR(50),
    bank_iban VARCHAR(34),
    bank_bic VARCHAR(11),
    bank_name VARCHAR(255),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_persons_tenant ON persons(tenant_id);
CREATE INDEX idx_persons_name ON persons(last_name, first_name);

-- Shareholders (Kommanditisten/Gesellschafter)
CREATE TABLE shareholders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id), -- Optional: Portal-Zugang
    shareholder_number VARCHAR(50),
    entry_date DATE,
    exit_date DATE,
    capital_contribution DECIMAL(15, 2),
    liability_amount DECIMAL(15, 2),
    ownership_percentage DECIMAL(8, 5),
    voting_rights_percentage DECIMAL(8, 5),
    distribution_percentage DECIMAL(8, 5),
    status VARCHAR(50) DEFAULT 'active',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_shareholders_tenant ON shareholders(tenant_id);
CREATE INDEX idx_shareholders_fund ON shareholders(fund_id);
CREATE INDEX idx_shareholders_person ON shareholders(person_id);

-- =====================================================
-- LEASE & PLOT MANAGEMENT
-- =====================================================

-- Plots (Flurstücke)
CREATE TABLE plots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    park_id UUID REFERENCES parks(id),
    cadastral_district VARCHAR(255), -- Gemarkung
    field_number VARCHAR(50), -- Flur
    plot_number VARCHAR(50), -- Flurstück
    area_sqm DECIMAL(12, 2),
    usage_type VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_plots_tenant ON plots(tenant_id);
CREATE INDEX idx_plots_park ON plots(park_id);

-- Leases (Pachtverträge)
CREATE TABLE leases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plot_id UUID NOT NULL REFERENCES plots(id) ON DELETE CASCADE,
    lessor_id UUID NOT NULL REFERENCES persons(id), -- Verpächter
    contract_number VARCHAR(100),
    start_date DATE NOT NULL,
    end_date DATE,
    notice_period_months INTEGER DEFAULT 12,
    annual_rent DECIMAL(12, 2),
    rent_increase_type VARCHAR(50), -- fixed, index
    rent_increase_percentage DECIMAL(5, 2),
    rent_increase_interval_years INTEGER,
    payment_schedule VARCHAR(50) DEFAULT 'yearly', -- monthly, quarterly, yearly
    status contract_status DEFAULT 'active',
    document_url TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_leases_tenant ON leases(tenant_id);
CREATE INDEX idx_leases_plot ON leases(plot_id);
CREATE INDEX idx_leases_end_date ON leases(end_date);

-- =====================================================
-- CONTRACT MANAGEMENT
-- =====================================================

-- Contracts (Verträge allgemein)
CREATE TABLE contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    park_id UUID REFERENCES parks(id),
    turbine_id UUID REFERENCES turbines(id),
    fund_id UUID REFERENCES funds(id),
    contract_type contract_type NOT NULL,
    contract_number VARCHAR(100),
    title VARCHAR(255) NOT NULL,
    partner_name VARCHAR(255),
    partner_id UUID REFERENCES persons(id),
    start_date DATE NOT NULL,
    end_date DATE,
    notice_period_months INTEGER,
    notice_deadline DATE,
    auto_renewal BOOLEAN DEFAULT false,
    renewal_period_months INTEGER,
    annual_value DECIMAL(15, 2),
    payment_terms TEXT,
    status contract_status DEFAULT 'active',
    document_url TEXT,
    reminder_days INTEGER[] DEFAULT '{90, 30}',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_contracts_tenant ON contracts(tenant_id);
CREATE INDEX idx_contracts_type ON contracts(contract_type);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);
CREATE INDEX idx_contracts_notice_deadline ON contracts(notice_deadline);

-- =====================================================
-- VOTING SYSTEM
-- =====================================================

-- Votes (Abstimmungen)
CREATE TABLE votes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fund_id UUID NOT NULL REFERENCES funds(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    vote_type VARCHAR(50) DEFAULT 'simple', -- simple, multiple_choice
    options JSONB NOT NULL DEFAULT '["Ja", "Nein", "Enthaltung"]',
    start_date TIMESTAMPTZ NOT NULL,
    end_date TIMESTAMPTZ NOT NULL,
    quorum_percentage DECIMAL(5, 2),
    requires_capital_majority BOOLEAN DEFAULT false,
    status vote_status DEFAULT 'draft',
    results JSONB,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_votes_tenant ON votes(tenant_id);
CREATE INDEX idx_votes_fund ON votes(fund_id);
CREATE INDEX idx_votes_status ON votes(status);

-- Vote Responses
CREATE TABLE vote_responses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    vote_id UUID NOT NULL REFERENCES votes(id) ON DELETE CASCADE,
    shareholder_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE,
    selected_option VARCHAR(255) NOT NULL,
    voted_by UUID REFERENCES shareholders(id), -- Für Vollmacht-Abstimmung
    proxy_id UUID REFERENCES vote_proxies(id),
    voted_at TIMESTAMPTZ DEFAULT NOW(),
    ip_address INET,
    UNIQUE(vote_id, shareholder_id)
);

CREATE INDEX idx_vote_responses_vote ON vote_responses(vote_id);

-- Vote Proxies (Vollmachten)
CREATE TABLE vote_proxies (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    grantor_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE, -- Vollmachtgeber
    grantee_id UUID NOT NULL REFERENCES shareholders(id) ON DELETE CASCADE, -- Vollmachtnehmer
    vote_id UUID REFERENCES votes(id), -- NULL = Generalvollmacht
    valid_from DATE NOT NULL,
    valid_until DATE,
    is_active BOOLEAN DEFAULT true,
    document_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_vote_proxies_tenant ON vote_proxies(tenant_id);
CREATE INDEX idx_vote_proxies_grantee ON vote_proxies(grantee_id);

-- =====================================================
-- DOCUMENT MANAGEMENT
-- =====================================================

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    category document_category NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    version INTEGER DEFAULT 1,
    parent_id UUID REFERENCES documents(id), -- Für Versionierung
    -- Zuordnungen (optional)
    park_id UUID REFERENCES parks(id),
    turbine_id UUID REFERENCES turbines(id),
    fund_id UUID REFERENCES funds(id),
    contract_id UUID REFERENCES contracts(id),
    shareholder_id UUID REFERENCES shareholders(id),
    -- Metadaten
    tags TEXT[],
    is_archived BOOLEAN DEFAULT false,
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_category ON documents(category);
CREATE INDEX idx_documents_park ON documents(park_id);
CREATE INDEX idx_documents_fund ON documents(fund_id);
CREATE INDEX idx_documents_parent ON documents(parent_id);

-- =====================================================
-- INVOICING SYSTEM
-- =====================================================

-- Invoices (Rechnungen/Gutschriften)
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    invoice_type invoice_type NOT NULL,
    invoice_number VARCHAR(50) NOT NULL,
    invoice_date DATE NOT NULL,
    due_date DATE,
    -- Empfänger
    recipient_type VARCHAR(50), -- shareholder, lessor, vendor
    recipient_id UUID, -- Referenz auf shareholders, persons, etc.
    recipient_name VARCHAR(255),
    recipient_address TEXT,
    -- Zuordnungen
    fund_id UUID REFERENCES funds(id),
    park_id UUID REFERENCES parks(id),
    -- Beträge
    net_amount DECIMAL(15, 2) NOT NULL,
    tax_rate DECIMAL(5, 2) DEFAULT 19.00,
    tax_amount DECIMAL(15, 2),
    gross_amount DECIMAL(15, 2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'EUR',
    -- Status
    status invoice_status DEFAULT 'draft',
    sent_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    -- Dokument
    pdf_url TEXT,
    notes TEXT,
    line_items JSONB DEFAULT '[]',
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_date ON invoices(invoice_date);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Payment Schedule (für automatische Abrechnungen)
CREATE TABLE payment_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    schedule_type VARCHAR(50) NOT NULL, -- lease_payment, distribution, etc.
    reference_id UUID NOT NULL, -- lease_id, fund_id, etc.
    reference_type VARCHAR(50) NOT NULL,
    frequency VARCHAR(50) NOT NULL, -- monthly, quarterly, yearly
    next_execution_date DATE NOT NULL,
    amount DECIMAL(15, 2),
    is_active BOOLEAN DEFAULT true,
    last_executed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_schedules_tenant ON payment_schedules(tenant_id);
CREATE INDEX idx_payment_schedules_next ON payment_schedules(next_execution_date);

-- =====================================================
-- NOTIFICATIONS
-- =====================================================

-- Notifications
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    reference_type VARCHAR(50),
    reference_id UUID,
    is_read BOOLEAN DEFAULT false,
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_unread ON notifications(user_id, is_read) WHERE is_read = false;

-- News/Announcements
CREATE TABLE news (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    fund_id UUID REFERENCES funds(id),
    title VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    is_published BOOLEAN DEFAULT false,
    published_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_news_tenant ON news(tenant_id);
CREATE INDEX idx_news_published ON news(is_published, published_at);

-- =====================================================
-- WEATHER DATA
-- =====================================================

-- Weather Data
CREATE TABLE weather_data (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    park_id UUID NOT NULL REFERENCES parks(id) ON DELETE CASCADE,
    recorded_at TIMESTAMPTZ NOT NULL,
    wind_speed_ms DECIMAL(6, 2),
    wind_direction_deg INTEGER,
    temperature_c DECIMAL(5, 2),
    humidity_percent INTEGER,
    pressure_hpa DECIMAL(7, 2),
    weather_condition VARCHAR(100),
    source VARCHAR(50) DEFAULT 'openweathermap',
    raw_data JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_weather_park ON weather_data(park_id);
CREATE INDEX idx_weather_recorded ON weather_data(recorded_at);
-- Partitioning für große Datenmengen empfohlen

-- =====================================================
-- AUDIT LOG
-- =====================================================

-- Audit Log
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id),
    user_id UUID REFERENCES users(id),
    action audit_action NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    impersonated_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_tenant ON audit_logs(tenant_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_logs(created_at);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tenant-scoped tables
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE parks ENABLE ROW LEVEL SECURITY;
ALTER TABLE turbines ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE funds ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE shareholders ENABLE ROW LEVEL SECURITY;
ALTER TABLE plots ENABLE ROW LEVEL SECURITY;
ALTER TABLE leases ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE vote_proxies ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's tenant_id
CREATE OR REPLACE FUNCTION auth.tenant_id()
RETURNS UUID AS $$
    SELECT COALESCE(
        (current_setting('request.jwt.claims', true)::json->>'tenant_id')::uuid,
        (SELECT tenant_id FROM users WHERE id = auth.uid())
    );
$$ LANGUAGE SQL STABLE;

-- Helper function to check if user is superadmin
CREATE OR REPLACE FUNCTION auth.is_superadmin()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM users
        WHERE id = auth.uid()
        AND role = 'superadmin'
    );
$$ LANGUAGE SQL STABLE;

-- RLS Policies for parks (example - apply similar to all tables)
CREATE POLICY "Users can view parks of their tenant"
    ON parks FOR SELECT
    USING (tenant_id = auth.tenant_id() OR auth.is_superadmin());

CREATE POLICY "Managers can insert parks"
    ON parks FOR INSERT
    WITH CHECK (
        tenant_id = auth.tenant_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('superadmin', 'admin', 'manager')
        )
    );

CREATE POLICY "Managers can update parks"
    ON parks FOR UPDATE
    USING (tenant_id = auth.tenant_id() OR auth.is_superadmin())
    WITH CHECK (
        tenant_id = auth.tenant_id()
        AND EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('superadmin', 'admin', 'manager')
        )
    );

-- Apply similar policies to all other tables...
-- (Abbreviated for brevity - full policies would follow same pattern)

-- =====================================================
-- TRIGGERS FOR AUDIT LOG
-- =====================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values)
        VALUES (
            NEW.tenant_id,
            auth.uid(),
            'CREATE',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values)
        VALUES (
            NEW.tenant_id,
            auth.uid(),
            'UPDATE',
            TG_TABLE_NAME,
            NEW.id,
            to_jsonb(OLD),
            to_jsonb(NEW)
        );
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values)
        VALUES (
            OLD.tenant_id,
            auth.uid(),
            'DELETE',
            TG_TABLE_NAME,
            OLD.id,
            to_jsonb(OLD)
        );
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply audit trigger to important tables
CREATE TRIGGER audit_parks AFTER INSERT OR UPDATE OR DELETE ON parks
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_turbines AFTER INSERT OR UPDATE OR DELETE ON turbines
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_shareholders AFTER INSERT OR UPDATE OR DELETE ON shareholders
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_contracts AFTER INSERT OR UPDATE OR DELETE ON contracts
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_invoices AFTER INSERT OR UPDATE OR DELETE ON invoices
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_documents AFTER INSERT OR UPDATE OR DELETE ON documents
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_votes AFTER INSERT OR UPDATE OR DELETE ON votes
    FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- =====================================================
-- UPDATED_AT TRIGGER
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_parks_updated_at BEFORE UPDATE ON parks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_turbines_updated_at BEFORE UPDATE ON turbines
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ... (apply to all other tables)

-- =====================================================
-- INITIAL DATA
-- =====================================================

-- Insert default superadmin tenant (for system administration)
INSERT INTO tenants (id, name, slug, is_active)
VALUES ('00000000-0000-0000-0000-000000000000', 'System', 'system', true);
