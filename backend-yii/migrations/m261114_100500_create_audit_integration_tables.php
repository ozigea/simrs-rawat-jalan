<?php

use yii\db\Migration;

/**
 * audit_log (D-4) and the integration tables (D-5). Node may write only integration_*.
 */
class m261114_100500_create_audit_integration_tables extends Migration
{
    public function up()
    {
        $this->db->pdo->exec(<<<'SQL'
CREATE TABLE audit_log (
    id         bigserial PRIMARY KEY,
    table_name varchar(60)  NOT NULL,
    record_id  varchar(64)  NOT NULL,
    action     varchar(10)  NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE','VOID')),
    old_values jsonb,
    new_values jsonb,
    reason     text,
    user_id    integer,
    created_at timestamptz  NOT NULL DEFAULT now()
);

-- Transactional outbox: written by Yii in the same transaction as the business change,
-- consumed by the Node worker (FOR UPDATE SKIP LOCKED, exponential backoff, max 5 attempts).
CREATE TABLE integration_outbox (
    id              bigserial PRIMARY KEY,
    event_type      varchar(60) NOT NULL,
    aggregate_type  varchar(40) NOT NULL,
    aggregate_id    bigint      NOT NULL,
    payload         jsonb       NOT NULL,
    status          varchar(10) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','SENT','FAILED')),
    attempts        integer     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz NOT NULL DEFAULT now(),
    last_error      text,
    sent_at         timestamptz,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Inbox: results from external systems are stored first; UNIQUE (source, external_id) makes
-- re-delivery harmless.
CREATE TABLE integration_inbox (
    id              bigserial PRIMARY KEY,
    source          varchar(30)  NOT NULL,
    external_id     varchar(100) NOT NULL,
    payload         jsonb        NOT NULL,
    status          varchar(10)  NOT NULL DEFAULT 'RECEIVED' CHECK (status IN ('RECEIVED','FORWARDED','FAILED')),
    attempts        integer      NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    next_attempt_at timestamptz  NOT NULL DEFAULT now(),
    last_error      text,
    created_at      timestamptz  NOT NULL DEFAULT now(),
    updated_at      timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT integration_inbox_source_external_uq UNIQUE (source, external_id)
);
SQL);
    }

    public function down()
    {
        $this->db->pdo->exec('DROP TABLE integration_inbox, integration_outbox, audit_log;');
    }
}
