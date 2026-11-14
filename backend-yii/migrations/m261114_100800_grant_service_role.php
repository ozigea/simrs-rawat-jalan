<?php

use yii\db\Migration;

/**
 * Enforces the Yii/Node split in the database (plan section 4.2): the Node role reads the
 * dashboard views and writes only the integration tables. Everything else = permission denied.
 * Views run with the owner's (simrs_core) rights, so Node needs no access to base tables.
 */
class m261114_100800_grant_service_role extends Migration
{
    public function up()
    {
        $this->db->pdo->exec(<<<'SQL'
GRANT USAGE ON SCHEMA public TO simrs_service;
GRANT SELECT ON v_dashboard_visit_daily, v_dashboard_procedure_daily, v_dashboard_revenue_daily,
                v_dashboard_medicine_daily, v_dashboard_invoice_status TO simrs_service;
GRANT SELECT, INSERT, UPDATE ON integration_outbox, integration_inbox TO simrs_service;
GRANT USAGE, SELECT ON SEQUENCE integration_outbox_id_seq, integration_inbox_id_seq TO simrs_service;
SQL);
    }

    public function down()
    {
        $this->db->pdo->exec(<<<'SQL'
REVOKE ALL ON integration_outbox, integration_inbox FROM simrs_service;
REVOKE ALL ON SEQUENCE integration_outbox_id_seq, integration_inbox_id_seq FROM simrs_service;
REVOKE ALL ON v_dashboard_visit_daily, v_dashboard_procedure_daily, v_dashboard_revenue_daily,
              v_dashboard_medicine_daily, v_dashboard_invoice_status FROM simrs_service;
REVOKE USAGE ON SCHEMA public FROM simrs_service;
SQL);
    }
}
