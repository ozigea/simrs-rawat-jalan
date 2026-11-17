--
-- PostgreSQL database dump
--

\restrict ax5gAn4OLFU4sZpfHxV87GML66rWUq9ZVFL97QKRfF4pZ0dpJb2YIRbPq4htPEr

-- Dumped from database version 16.15
-- Dumped by pg_dump version 16.15

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: app_user; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_user (
    id integer NOT NULL,
    username character varying(50) NOT NULL,
    password_hash character varying(255) NOT NULL,
    full_name character varying(150) NOT NULL,
    staff_id integer,
    is_active boolean DEFAULT true NOT NULL,
    last_login_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT app_user_username_check CHECK (((username)::text = lower((username)::text)))
);


--
-- Name: app_user_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.app_user_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: app_user_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.app_user_id_seq OWNED BY public.app_user.id;


--
-- Name: audit_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_log (
    id bigint NOT NULL,
    table_name character varying(60) NOT NULL,
    record_id character varying(64) NOT NULL,
    action character varying(10) NOT NULL,
    old_values jsonb,
    new_values jsonb,
    reason text,
    user_id integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT audit_log_action_check CHECK (((action)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying, 'VOID'::character varying])::text[])))
);


--
-- Name: audit_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.audit_log_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: audit_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.audit_log_id_seq OWNED BY public.audit_log.id;


--
-- Name: auth_assignment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_assignment (
    item_name character varying(64) NOT NULL,
    user_id character varying(64) NOT NULL,
    created_at integer
);


--
-- Name: auth_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_item (
    name character varying(64) NOT NULL,
    type smallint NOT NULL,
    description text,
    rule_name character varying(64),
    data bytea,
    created_at integer,
    updated_at integer
);


--
-- Name: auth_item_child; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_item_child (
    parent character varying(64) NOT NULL,
    child character varying(64) NOT NULL
);


--
-- Name: auth_rule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_rule (
    name character varying(64) NOT NULL,
    data bytea,
    created_at integer,
    updated_at integer
);


--
-- Name: charge_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.charge_item (
    id bigint NOT NULL,
    visit_id bigint NOT NULL,
    invoice_id bigint,
    source_type character varying(15) NOT NULL,
    source_id bigint,
    description character varying(255) NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    amount numeric(14,2) NOT NULL,
    status character varying(10) DEFAULT 'ACTIVE'::character varying NOT NULL,
    void_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT charge_item_check CHECK ((amount = ((qty)::numeric * unit_price))),
    CONSTRAINT charge_item_check1 CHECK ((((status)::text = 'ACTIVE'::text) OR (void_reason IS NOT NULL))),
    CONSTRAINT charge_item_check2 CHECK ((((source_type)::text = 'ADJUSTMENT'::text) OR (source_id IS NOT NULL))),
    CONSTRAINT charge_item_qty_check CHECK ((qty > 0)),
    CONSTRAINT charge_item_source_type_check CHECK (((source_type)::text = ANY ((ARRAY['REGISTRATION'::character varying, 'PROCEDURE'::character varying, 'LAB'::character varying, 'MEDICINE'::character varying, 'ADJUSTMENT'::character varying])::text[]))),
    CONSTRAINT charge_item_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'VOID'::character varying])::text[]))),
    CONSTRAINT charge_item_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: charge_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.charge_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: charge_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.charge_item_id_seq OWNED BY public.charge_item.id;


--
-- Name: doctor_schedule; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.doctor_schedule (
    id integer NOT NULL,
    doctor_id integer NOT NULL,
    polyclinic_id integer NOT NULL,
    day_of_week smallint NOT NULL,
    start_time time without time zone NOT NULL,
    end_time time without time zone NOT NULL,
    quota integer NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT doctor_schedule_check CHECK ((end_time > start_time)),
    CONSTRAINT doctor_schedule_day_of_week_check CHECK (((day_of_week >= 1) AND (day_of_week <= 7))),
    CONSTRAINT doctor_schedule_quota_check CHECK ((quota > 0))
);


--
-- Name: doctor_schedule_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.doctor_schedule_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: doctor_schedule_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.doctor_schedule_id_seq OWNED BY public.doctor_schedule.id;


--
-- Name: examination; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.examination (
    id bigint NOT NULL,
    visit_id bigint NOT NULL,
    anamnesis text,
    chief_complaint text,
    systolic smallint,
    diastolic smallint,
    pulse smallint,
    resp_rate smallint,
    temperature numeric(4,1),
    spo2 smallint,
    weight_kg numeric(5,1),
    height_cm numeric(5,1),
    physical_exam text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT examination_diastolic_check CHECK (((diastolic >= 20) AND (diastolic <= 200))),
    CONSTRAINT examination_height_cm_check CHECK ((height_cm > (0)::numeric)),
    CONSTRAINT examination_pulse_check CHECK (((pulse >= 20) AND (pulse <= 300))),
    CONSTRAINT examination_resp_rate_check CHECK (((resp_rate >= 5) AND (resp_rate <= 80))),
    CONSTRAINT examination_spo2_check CHECK (((spo2 >= 0) AND (spo2 <= 100))),
    CONSTRAINT examination_systolic_check CHECK (((systolic >= 30) AND (systolic <= 300))),
    CONSTRAINT examination_temperature_check CHECK (((temperature >= (25)::numeric) AND (temperature <= (45)::numeric))),
    CONSTRAINT examination_weight_kg_check CHECK ((weight_kg > (0)::numeric))
);


--
-- Name: examination_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.examination_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: examination_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.examination_id_seq OWNED BY public.examination.id;


--
-- Name: icd10; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.icd10 (
    code character varying(10) NOT NULL,
    description character varying(255) NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: integration_inbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_inbox (
    id bigint NOT NULL,
    source character varying(30) NOT NULL,
    external_id character varying(100) NOT NULL,
    payload jsonb NOT NULL,
    status character varying(10) DEFAULT 'RECEIVED'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_inbox_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT integration_inbox_status_check CHECK (((status)::text = ANY ((ARRAY['RECEIVED'::character varying, 'FORWARDED'::character varying, 'FAILED'::character varying])::text[])))
);


--
-- Name: integration_inbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_inbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_inbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_inbox_id_seq OWNED BY public.integration_inbox.id;


--
-- Name: integration_outbox; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.integration_outbox (
    id bigint NOT NULL,
    event_type character varying(60) NOT NULL,
    aggregate_type character varying(40) NOT NULL,
    aggregate_id bigint NOT NULL,
    payload jsonb NOT NULL,
    status character varying(10) DEFAULT 'PENDING'::character varying NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
    last_error text,
    sent_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT integration_outbox_attempts_check CHECK ((attempts >= 0)),
    CONSTRAINT integration_outbox_status_check CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'SENT'::character varying, 'FAILED'::character varying])::text[])))
);


--
-- Name: integration_outbox_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.integration_outbox_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: integration_outbox_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.integration_outbox_id_seq OWNED BY public.integration_outbox.id;


--
-- Name: invoice_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoice (
    id bigint NOT NULL,
    invoice_no character varying(30) DEFAULT ((('INV'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.invoice_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    visit_id bigint NOT NULL,
    total_amount numeric(14,2) DEFAULT 0 NOT NULL,
    paid_amount numeric(14,2) DEFAULT 0 NOT NULL,
    status character varying(10) DEFAULT 'UNPAID'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT invoice_paid_amount_check CHECK ((paid_amount >= (0)::numeric)),
    CONSTRAINT invoice_status_check CHECK (((status)::text = ANY ((ARRAY['UNPAID'::character varying, 'PARTIAL'::character varying, 'PAID'::character varying, 'OVERPAID'::character varying])::text[]))),
    CONSTRAINT invoice_total_amount_check CHECK ((total_amount >= (0)::numeric))
);


--
-- Name: invoice_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoice_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoice_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoice_id_seq OWNED BY public.invoice.id;


--
-- Name: lab_order_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_order_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_order; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order (
    id bigint NOT NULL,
    order_no character varying(30) DEFAULT ((('LAB'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.lab_order_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    visit_id bigint NOT NULL,
    doctor_id integer NOT NULL,
    status character varying(15) DEFAULT 'ORDERED'::character varying NOT NULL,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT lab_order_status_check CHECK (((status)::text = ANY ((ARRAY['ORDERED'::character varying, 'IN_PROGRESS'::character varying, 'RESULTED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: lab_order_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_order_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_order_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lab_order_id_seq OWNED BY public.lab_order.id;


--
-- Name: lab_order_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_order_item (
    id bigint NOT NULL,
    lab_order_id bigint NOT NULL,
    lab_test_id integer NOT NULL,
    tariff numeric(14,2) NOT NULL,
    result_value character varying(100),
    result_flag character varying(10),
    result_note text,
    result_source character varying(10),
    resulted_by integer,
    resulted_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT lab_order_item_check CHECK (((result_value IS NULL) = (resulted_at IS NULL))),
    CONSTRAINT lab_order_item_result_flag_check CHECK (((result_flag)::text = ANY ((ARRAY['NORMAL'::character varying, 'LOW'::character varying, 'HIGH'::character varying, 'CRITICAL'::character varying])::text[]))),
    CONSTRAINT lab_order_item_result_source_check CHECK (((result_source)::text = ANY ((ARRAY['MANUAL'::character varying, 'LIS'::character varying])::text[]))),
    CONSTRAINT lab_order_item_tariff_check CHECK ((tariff >= (0)::numeric))
);


--
-- Name: lab_order_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_order_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_order_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lab_order_item_id_seq OWNED BY public.lab_order_item.id;


--
-- Name: lab_test; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.lab_test (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    tariff numeric(14,2) NOT NULL,
    unit character varying(30),
    normal_range character varying(100),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT lab_test_tariff_check CHECK ((tariff >= (0)::numeric))
);


--
-- Name: lab_test_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.lab_test_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: lab_test_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.lab_test_id_seq OWNED BY public.lab_test.id;


--
-- Name: medical_procedure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_procedure (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    tariff numeric(14,2) NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT medical_procedure_tariff_check CHECK ((tariff >= (0)::numeric))
);


--
-- Name: medical_procedure_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medical_procedure_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medical_procedure_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medical_procedure_id_seq OWNED BY public.medical_procedure.id;


--
-- Name: medical_staff; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medical_staff (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    staff_type character varying(20) NOT NULL,
    license_no character varying(50),
    specialization character varying(100),
    phone character varying(30),
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT medical_staff_staff_type_check CHECK (((staff_type)::text = ANY ((ARRAY['DOCTOR'::character varying, 'NURSE'::character varying, 'PHARMACIST'::character varying, 'LAB_ANALYST'::character varying])::text[])))
);


--
-- Name: medical_staff_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medical_staff_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medical_staff_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medical_staff_id_seq OWNED BY public.medical_staff.id;


--
-- Name: medicine; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.medicine (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(150) NOT NULL,
    unit character varying(30) NOT NULL,
    price numeric(14,2) NOT NULL,
    stock_qty integer DEFAULT 0 NOT NULL,
    min_stock integer DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT medicine_min_stock_check CHECK ((min_stock >= 0)),
    CONSTRAINT medicine_price_check CHECK ((price >= (0)::numeric)),
    CONSTRAINT medicine_stock_qty_check CHECK ((stock_qty >= 0))
);


--
-- Name: medicine_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.medicine_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: medicine_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.medicine_id_seq OWNED BY public.medicine.id;


--
-- Name: migration; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.migration (
    version character varying(180) NOT NULL,
    apply_time integer
);


--
-- Name: patient_mrn_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_mrn_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.patient (
    id integer NOT NULL,
    mrn character varying(20) DEFAULT ('RM-'::text || lpad((nextval('public.patient_mrn_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    nik character varying(16),
    name character varying(150) NOT NULL,
    birth_date date NOT NULL,
    gender character(1) NOT NULL,
    phone character varying(30),
    address text,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT patient_gender_check CHECK ((gender = ANY (ARRAY['M'::bpchar, 'F'::bpchar]))),
    CONSTRAINT patient_nik_check CHECK (((nik)::text ~ '^[0-9]{16}$'::text))
);


--
-- Name: patient_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.patient_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: patient_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.patient_id_seq OWNED BY public.patient.id;


--
-- Name: payment_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.payment (
    id bigint NOT NULL,
    payment_no character varying(30) DEFAULT ((('PAY'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.payment_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    invoice_id bigint NOT NULL,
    amount numeric(14,2) NOT NULL,
    method character varying(10) NOT NULL,
    reference_no character varying(60),
    cash_received numeric(14,2),
    change_amount numeric(14,2) DEFAULT 0 NOT NULL,
    idempotency_key character varying(64) NOT NULL,
    request_hash character varying(64) NOT NULL,
    status character varying(10) DEFAULT 'SUCCESS'::character varying NOT NULL,
    cashier_id integer NOT NULL,
    paid_at timestamp with time zone DEFAULT now() NOT NULL,
    paid_date date DEFAULT CURRENT_DATE NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT payment_amount_check CHECK ((amount > (0)::numeric)),
    CONSTRAINT payment_change_amount_check CHECK ((change_amount >= (0)::numeric)),
    CONSTRAINT payment_check CHECK (((((method)::text = 'CASH'::text) AND (cash_received IS NOT NULL) AND (cash_received >= amount) AND (change_amount = (cash_received - amount))) OR (((method)::text <> 'CASH'::text) AND (cash_received IS NULL) AND (change_amount = (0)::numeric)))),
    CONSTRAINT payment_method_check CHECK (((method)::text = ANY ((ARRAY['CASH'::character varying, 'DEBIT'::character varying, 'CREDIT'::character varying, 'QRIS'::character varying, 'TRANSFER'::character varying])::text[]))),
    CONSTRAINT payment_status_check CHECK (((status)::text = ANY ((ARRAY['SUCCESS'::character varying, 'VOID'::character varying])::text[])))
);


--
-- Name: payment_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.payment_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: payment_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.payment_id_seq OWNED BY public.payment.id;


--
-- Name: polyclinic; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.polyclinic (
    id integer NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(100) NOT NULL,
    registration_fee numeric(14,2) DEFAULT 0 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT polyclinic_registration_fee_check CHECK ((registration_fee >= (0)::numeric))
);


--
-- Name: polyclinic_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.polyclinic_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: polyclinic_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.polyclinic_id_seq OWNED BY public.polyclinic.id;


--
-- Name: prescription_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescription_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescription; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription (
    id bigint NOT NULL,
    prescription_no character varying(30) DEFAULT ((('RX'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.prescription_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    visit_id bigint NOT NULL,
    doctor_id integer NOT NULL,
    status character varying(15) DEFAULT 'NEW'::character varying NOT NULL,
    notes text,
    dispensed_by integer,
    dispensed_at timestamp with time zone,
    dispensed_date date,
    cancel_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT prescription_check CHECK ((((status)::text = 'DISPENSED'::text) = ((dispensed_at IS NOT NULL) AND (dispensed_by IS NOT NULL) AND (dispensed_date IS NOT NULL)))),
    CONSTRAINT prescription_check1 CHECK ((((status)::text <> 'CANCELLED'::text) OR (cancel_reason IS NOT NULL))),
    CONSTRAINT prescription_status_check CHECK (((status)::text = ANY ((ARRAY['NEW'::character varying, 'DISPENSED'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: prescription_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescription_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescription_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prescription_id_seq OWNED BY public.prescription.id;


--
-- Name: prescription_item; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prescription_item (
    id bigint NOT NULL,
    prescription_id bigint NOT NULL,
    medicine_id integer NOT NULL,
    dose character varying(100) NOT NULL,
    frequency character varying(100) NOT NULL,
    qty integer NOT NULL,
    unit_price numeric(14,2) NOT NULL,
    instruction text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT prescription_item_qty_check CHECK ((qty > 0)),
    CONSTRAINT prescription_item_unit_price_check CHECK ((unit_price >= (0)::numeric))
);


--
-- Name: prescription_item_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.prescription_item_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: prescription_item_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.prescription_item_id_seq OWNED BY public.prescription_item.id;


--
-- Name: queue_counter; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.queue_counter (
    schedule_id integer NOT NULL,
    queue_date date NOT NULL,
    last_no integer NOT NULL,
    CONSTRAINT queue_counter_last_no_check CHECK ((last_no > 0))
);


--
-- Name: stock_movement; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stock_movement (
    id bigint NOT NULL,
    medicine_id integer NOT NULL,
    qty_change integer NOT NULL,
    movement_type character varying(10) NOT NULL,
    ref_type character varying(30),
    ref_id bigint,
    reason text,
    balance_after integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    CONSTRAINT stock_movement_balance_after_check CHECK ((balance_after >= 0)),
    CONSTRAINT stock_movement_check CHECK (((((movement_type)::text = 'IN'::text) AND (qty_change > 0)) OR (((movement_type)::text = 'OUT'::text) AND (qty_change < 0)) OR ((movement_type)::text = 'ADJUST'::text))),
    CONSTRAINT stock_movement_movement_type_check CHECK (((movement_type)::text = ANY ((ARRAY['IN'::character varying, 'OUT'::character varying, 'ADJUST'::character varying])::text[]))),
    CONSTRAINT stock_movement_qty_change_check CHECK ((qty_change <> 0))
);


--
-- Name: stock_movement_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stock_movement_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stock_movement_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stock_movement_id_seq OWNED BY public.stock_movement.id;


--
-- Name: visit_no_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_no_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visit; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit (
    id bigint NOT NULL,
    visit_no character varying(30) DEFAULT ((('V'::text || to_char((CURRENT_DATE)::timestamp with time zone, 'YYYYMMDD'::text)) || '-'::text) || lpad((nextval('public.visit_no_seq'::regclass))::text, 6, '0'::text)) NOT NULL,
    patient_id integer NOT NULL,
    schedule_id integer NOT NULL,
    polyclinic_id integer NOT NULL,
    doctor_id integer NOT NULL,
    visit_date date NOT NULL,
    queue_no integer NOT NULL,
    status character varying(20) DEFAULT 'WAITING'::character varying NOT NULL,
    idempotency_key character varying(64),
    cancel_reason text,
    called_at timestamp with time zone,
    finished_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT visit_check CHECK ((((status)::text <> 'CANCELLED'::text) OR (cancel_reason IS NOT NULL))),
    CONSTRAINT visit_queue_no_check CHECK ((queue_no > 0)),
    CONSTRAINT visit_status_check CHECK (((status)::text = ANY ((ARRAY['WAITING'::character varying, 'IN_EXAM'::character varying, 'EXAMINED'::character varying, 'DONE'::character varying, 'CANCELLED'::character varying])::text[])))
);


--
-- Name: v_dashboard_invoice_status; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_invoice_status AS
 SELECT v.visit_date,
    i.status,
    count(*) AS invoice_count,
    sum(i.total_amount) AS total_amount,
    sum(i.paid_amount) AS paid_amount
   FROM (public.invoice i
     JOIN public.visit v ON ((v.id = i.visit_id)))
  GROUP BY v.visit_date, i.status;


--
-- Name: v_dashboard_medicine_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_medicine_daily AS
 SELECT rx.dispensed_date,
    pi.medicine_id,
    m.code AS medicine_code,
    m.name AS medicine_name,
    m.unit,
    sum(pi.qty) AS qty,
    sum(((pi.qty)::numeric * pi.unit_price)) AS amount
   FROM ((public.prescription_item pi
     JOIN public.prescription rx ON (((rx.id = pi.prescription_id) AND ((rx.status)::text = 'DISPENSED'::text))))
     JOIN public.medicine m ON ((m.id = pi.medicine_id)))
  GROUP BY rx.dispensed_date, pi.medicine_id, m.code, m.name, m.unit;


--
-- Name: visit_procedure; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_procedure (
    id bigint NOT NULL,
    visit_id bigint NOT NULL,
    procedure_id integer NOT NULL,
    qty integer DEFAULT 1 NOT NULL,
    unit_tariff numeric(14,2) NOT NULL,
    status character varying(10) DEFAULT 'ACTIVE'::character varying NOT NULL,
    void_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT visit_procedure_check CHECK ((((status)::text = 'ACTIVE'::text) OR (void_reason IS NOT NULL))),
    CONSTRAINT visit_procedure_qty_check CHECK ((qty > 0)),
    CONSTRAINT visit_procedure_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'VOID'::character varying])::text[]))),
    CONSTRAINT visit_procedure_unit_tariff_check CHECK ((unit_tariff >= (0)::numeric))
);


--
-- Name: v_dashboard_procedure_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_procedure_daily AS
 SELECT v.visit_date,
    vp.procedure_id,
    mp.code AS procedure_code,
    mp.name AS procedure_name,
    sum(vp.qty) AS qty,
    sum(((vp.qty)::numeric * vp.unit_tariff)) AS amount
   FROM ((public.visit_procedure vp
     JOIN public.visit v ON (((v.id = vp.visit_id) AND ((v.status)::text <> 'CANCELLED'::text))))
     JOIN public.medical_procedure mp ON ((mp.id = vp.procedure_id)))
  WHERE ((vp.status)::text = 'ACTIVE'::text)
  GROUP BY v.visit_date, vp.procedure_id, mp.code, mp.name;


--
-- Name: v_dashboard_revenue_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_revenue_daily AS
 SELECT paid_date AS pay_date,
    method,
    count(*) AS payment_count,
    sum(amount) AS amount
   FROM public.payment pay
  WHERE ((status)::text = 'SUCCESS'::text)
  GROUP BY paid_date, method;


--
-- Name: v_dashboard_visit_daily; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_dashboard_visit_daily AS
 SELECT v.visit_date,
    v.polyclinic_id,
    p.name AS polyclinic_name,
    count(*) FILTER (WHERE ((v.status)::text <> 'CANCELLED'::text)) AS visit_count,
    count(*) FILTER (WHERE ((v.status)::text = 'CANCELLED'::text)) AS cancelled_count
   FROM (public.visit v
     JOIN public.polyclinic p ON ((p.id = v.polyclinic_id)))
  GROUP BY v.visit_date, v.polyclinic_id, p.name;


--
-- Name: visit_diagnosis; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.visit_diagnosis (
    id bigint NOT NULL,
    visit_id bigint NOT NULL,
    icd10_code character varying(10) NOT NULL,
    type character varying(10) NOT NULL,
    status character varying(10) DEFAULT 'ACTIVE'::character varying NOT NULL,
    void_reason text,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    created_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer,
    CONSTRAINT visit_diagnosis_check CHECK ((((status)::text = 'ACTIVE'::text) OR (void_reason IS NOT NULL))),
    CONSTRAINT visit_diagnosis_status_check CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'VOID'::character varying])::text[]))),
    CONSTRAINT visit_diagnosis_type_check CHECK (((type)::text = ANY ((ARRAY['PRIMARY'::character varying, 'SECONDARY'::character varying])::text[])))
);


--
-- Name: visit_diagnosis_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_diagnosis_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visit_diagnosis_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visit_diagnosis_id_seq OWNED BY public.visit_diagnosis.id;


--
-- Name: visit_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visit_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visit_id_seq OWNED BY public.visit.id;


--
-- Name: visit_procedure_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.visit_procedure_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: visit_procedure_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.visit_procedure_id_seq OWNED BY public.visit_procedure.id;


--
-- Name: app_user id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user ALTER COLUMN id SET DEFAULT nextval('public.app_user_id_seq'::regclass);


--
-- Name: audit_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log ALTER COLUMN id SET DEFAULT nextval('public.audit_log_id_seq'::regclass);


--
-- Name: charge_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_item ALTER COLUMN id SET DEFAULT nextval('public.charge_item_id_seq'::regclass);


--
-- Name: doctor_schedule id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_schedule ALTER COLUMN id SET DEFAULT nextval('public.doctor_schedule_id_seq'::regclass);


--
-- Name: examination id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examination ALTER COLUMN id SET DEFAULT nextval('public.examination_id_seq'::regclass);


--
-- Name: integration_inbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_inbox ALTER COLUMN id SET DEFAULT nextval('public.integration_inbox_id_seq'::regclass);


--
-- Name: integration_outbox id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_outbox ALTER COLUMN id SET DEFAULT nextval('public.integration_outbox_id_seq'::regclass);


--
-- Name: invoice id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice ALTER COLUMN id SET DEFAULT nextval('public.invoice_id_seq'::regclass);


--
-- Name: lab_order id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order ALTER COLUMN id SET DEFAULT nextval('public.lab_order_id_seq'::regclass);


--
-- Name: lab_order_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item ALTER COLUMN id SET DEFAULT nextval('public.lab_order_item_id_seq'::regclass);


--
-- Name: lab_test id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_test ALTER COLUMN id SET DEFAULT nextval('public.lab_test_id_seq'::regclass);


--
-- Name: medical_procedure id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_procedure ALTER COLUMN id SET DEFAULT nextval('public.medical_procedure_id_seq'::regclass);


--
-- Name: medical_staff id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_staff ALTER COLUMN id SET DEFAULT nextval('public.medical_staff_id_seq'::regclass);


--
-- Name: medicine id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine ALTER COLUMN id SET DEFAULT nextval('public.medicine_id_seq'::regclass);


--
-- Name: patient id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient ALTER COLUMN id SET DEFAULT nextval('public.patient_id_seq'::regclass);


--
-- Name: payment id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment ALTER COLUMN id SET DEFAULT nextval('public.payment_id_seq'::regclass);


--
-- Name: polyclinic id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polyclinic ALTER COLUMN id SET DEFAULT nextval('public.polyclinic_id_seq'::regclass);


--
-- Name: prescription id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription ALTER COLUMN id SET DEFAULT nextval('public.prescription_id_seq'::regclass);


--
-- Name: prescription_item id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_item ALTER COLUMN id SET DEFAULT nextval('public.prescription_item_id_seq'::regclass);


--
-- Name: stock_movement id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement ALTER COLUMN id SET DEFAULT nextval('public.stock_movement_id_seq'::regclass);


--
-- Name: visit id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit ALTER COLUMN id SET DEFAULT nextval('public.visit_id_seq'::regclass);


--
-- Name: visit_diagnosis id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis ALTER COLUMN id SET DEFAULT nextval('public.visit_diagnosis_id_seq'::regclass);


--
-- Name: visit_procedure id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_procedure ALTER COLUMN id SET DEFAULT nextval('public.visit_procedure_id_seq'::regclass);


--
-- Name: app_user app_user_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_pkey PRIMARY KEY (id);


--
-- Name: app_user app_user_staff_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_staff_id_key UNIQUE (staff_id);


--
-- Name: app_user app_user_username_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_username_key UNIQUE (username);


--
-- Name: audit_log audit_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_log
    ADD CONSTRAINT audit_log_pkey PRIMARY KEY (id);


--
-- Name: auth_assignment auth_assignment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_assignment
    ADD CONSTRAINT auth_assignment_pkey PRIMARY KEY (item_name, user_id);


--
-- Name: auth_item_child auth_item_child_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_item_child
    ADD CONSTRAINT auth_item_child_pkey PRIMARY KEY (parent, child);


--
-- Name: auth_item auth_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_item
    ADD CONSTRAINT auth_item_pkey PRIMARY KEY (name);


--
-- Name: auth_rule auth_rule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_rule
    ADD CONSTRAINT auth_rule_pkey PRIMARY KEY (name);


--
-- Name: charge_item charge_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_item
    ADD CONSTRAINT charge_item_pkey PRIMARY KEY (id);


--
-- Name: doctor_schedule doctor_schedule_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_schedule
    ADD CONSTRAINT doctor_schedule_no_overlap EXCLUDE USING gist (doctor_id WITH =, day_of_week WITH =, tsrange(('2000-01-01'::date + start_time), ('2000-01-01'::date + end_time)) WITH &&) WHERE (is_active);


--
-- Name: doctor_schedule doctor_schedule_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_schedule
    ADD CONSTRAINT doctor_schedule_pkey PRIMARY KEY (id);


--
-- Name: examination examination_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examination
    ADD CONSTRAINT examination_pkey PRIMARY KEY (id);


--
-- Name: examination examination_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examination
    ADD CONSTRAINT examination_visit_id_key UNIQUE (visit_id);


--
-- Name: icd10 icd10_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.icd10
    ADD CONSTRAINT icd10_pkey PRIMARY KEY (code);


--
-- Name: integration_inbox integration_inbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_inbox
    ADD CONSTRAINT integration_inbox_pkey PRIMARY KEY (id);


--
-- Name: integration_inbox integration_inbox_source_external_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_inbox
    ADD CONSTRAINT integration_inbox_source_external_uq UNIQUE (source, external_id);


--
-- Name: integration_outbox integration_outbox_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.integration_outbox
    ADD CONSTRAINT integration_outbox_pkey PRIMARY KEY (id);


--
-- Name: invoice invoice_invoice_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_invoice_no_key UNIQUE (invoice_no);


--
-- Name: invoice invoice_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_pkey PRIMARY KEY (id);


--
-- Name: invoice invoice_visit_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_visit_id_key UNIQUE (visit_id);


--
-- Name: lab_order_item lab_order_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item
    ADD CONSTRAINT lab_order_item_pkey PRIMARY KEY (id);


--
-- Name: lab_order_item lab_order_item_test_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item
    ADD CONSTRAINT lab_order_item_test_uq UNIQUE (lab_order_id, lab_test_id);


--
-- Name: lab_order lab_order_order_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order
    ADD CONSTRAINT lab_order_order_no_key UNIQUE (order_no);


--
-- Name: lab_order lab_order_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order
    ADD CONSTRAINT lab_order_pkey PRIMARY KEY (id);


--
-- Name: lab_test lab_test_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_test
    ADD CONSTRAINT lab_test_code_key UNIQUE (code);


--
-- Name: lab_test lab_test_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_test
    ADD CONSTRAINT lab_test_pkey PRIMARY KEY (id);


--
-- Name: medical_procedure medical_procedure_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_procedure
    ADD CONSTRAINT medical_procedure_code_key UNIQUE (code);


--
-- Name: medical_procedure medical_procedure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_procedure
    ADD CONSTRAINT medical_procedure_pkey PRIMARY KEY (id);


--
-- Name: medical_staff medical_staff_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_staff
    ADD CONSTRAINT medical_staff_code_key UNIQUE (code);


--
-- Name: medical_staff medical_staff_license_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_staff
    ADD CONSTRAINT medical_staff_license_no_key UNIQUE (license_no);


--
-- Name: medical_staff medical_staff_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medical_staff
    ADD CONSTRAINT medical_staff_pkey PRIMARY KEY (id);


--
-- Name: medicine medicine_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine
    ADD CONSTRAINT medicine_code_key UNIQUE (code);


--
-- Name: medicine medicine_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.medicine
    ADD CONSTRAINT medicine_pkey PRIMARY KEY (id);


--
-- Name: migration migration_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.migration
    ADD CONSTRAINT migration_pkey PRIMARY KEY (version);


--
-- Name: patient patient_mrn_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient
    ADD CONSTRAINT patient_mrn_key UNIQUE (mrn);


--
-- Name: patient patient_nik_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient
    ADD CONSTRAINT patient_nik_key UNIQUE (nik);


--
-- Name: patient patient_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.patient
    ADD CONSTRAINT patient_pkey PRIMARY KEY (id);


--
-- Name: payment payment_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: payment payment_payment_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_payment_no_key UNIQUE (payment_no);


--
-- Name: payment payment_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_pkey PRIMARY KEY (id);


--
-- Name: polyclinic polyclinic_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polyclinic
    ADD CONSTRAINT polyclinic_code_key UNIQUE (code);


--
-- Name: polyclinic polyclinic_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.polyclinic
    ADD CONSTRAINT polyclinic_pkey PRIMARY KEY (id);


--
-- Name: prescription_item prescription_item_medicine_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_item
    ADD CONSTRAINT prescription_item_medicine_uq UNIQUE (prescription_id, medicine_id);


--
-- Name: prescription_item prescription_item_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_item
    ADD CONSTRAINT prescription_item_pkey PRIMARY KEY (id);


--
-- Name: prescription prescription_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_pkey PRIMARY KEY (id);


--
-- Name: prescription prescription_prescription_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_prescription_no_key UNIQUE (prescription_no);


--
-- Name: queue_counter queue_counter_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_counter
    ADD CONSTRAINT queue_counter_pkey PRIMARY KEY (schedule_id, queue_date);


--
-- Name: stock_movement stock_movement_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_pkey PRIMARY KEY (id);


--
-- Name: visit_diagnosis visit_diagnosis_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis
    ADD CONSTRAINT visit_diagnosis_pkey PRIMARY KEY (id);


--
-- Name: visit visit_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: visit visit_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_pkey PRIMARY KEY (id);


--
-- Name: visit_procedure visit_procedure_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_procedure
    ADD CONSTRAINT visit_procedure_pkey PRIMARY KEY (id);


--
-- Name: visit visit_queue_no_uq; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_queue_no_uq UNIQUE (schedule_id, visit_date, queue_no);


--
-- Name: visit visit_visit_no_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_visit_no_key UNIQUE (visit_no);


--
-- Name: audit_log_record_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_log_record_idx ON public.audit_log USING btree (table_name, record_id);


--
-- Name: charge_item_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_item_invoice_idx ON public.charge_item USING btree (invoice_id);


--
-- Name: charge_item_source_active_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX charge_item_source_active_uq ON public.charge_item USING btree (source_type, source_id) WHERE (((status)::text = 'ACTIVE'::text) AND (source_id IS NOT NULL));


--
-- Name: charge_item_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX charge_item_visit_idx ON public.charge_item USING btree (visit_id);


--
-- Name: doctor_schedule_poli_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX doctor_schedule_poli_idx ON public.doctor_schedule USING btree (polyclinic_id, day_of_week);


--
-- Name: idx-auth_assignment-user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx-auth_assignment-user_id" ON public.auth_assignment USING btree (user_id);


--
-- Name: idx-auth_item-type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "idx-auth_item-type" ON public.auth_item USING btree (type);


--
-- Name: integration_inbox_poll_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_inbox_poll_idx ON public.integration_inbox USING btree (status, next_attempt_at);


--
-- Name: integration_outbox_poll_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX integration_outbox_poll_idx ON public.integration_outbox USING btree (status, next_attempt_at);


--
-- Name: lab_order_item_order_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_item_order_idx ON public.lab_order_item USING btree (lab_order_id);


--
-- Name: lab_order_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_status_idx ON public.lab_order USING btree (status);


--
-- Name: lab_order_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX lab_order_visit_idx ON public.lab_order USING btree (visit_id);


--
-- Name: patient_name_trgm_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX patient_name_trgm_idx ON public.patient USING gin (name public.gin_trgm_ops);


--
-- Name: payment_invoice_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_invoice_idx ON public.payment USING btree (invoice_id);


--
-- Name: payment_paid_at_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_paid_at_idx ON public.payment USING btree (paid_at);


--
-- Name: payment_paid_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX payment_paid_date_idx ON public.payment USING btree (paid_date) WHERE ((status)::text = 'SUCCESS'::text);


--
-- Name: polyclinic_name_lower_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX polyclinic_name_lower_uq ON public.polyclinic USING btree (lower((name)::text));


--
-- Name: prescription_dispensed_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_dispensed_date_idx ON public.prescription USING btree (dispensed_date) WHERE ((status)::text = 'DISPENSED'::text);


--
-- Name: prescription_item_rx_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_item_rx_idx ON public.prescription_item USING btree (prescription_id);


--
-- Name: prescription_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_status_idx ON public.prescription USING btree (status);


--
-- Name: prescription_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX prescription_visit_idx ON public.prescription USING btree (visit_id);


--
-- Name: stock_movement_med_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX stock_movement_med_created_idx ON public.stock_movement USING btree (medicine_id, created_at);


--
-- Name: visit_date_poli_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_date_poli_idx ON public.visit USING btree (visit_date, polyclinic_id);


--
-- Name: visit_diagnosis_no_dup_code_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visit_diagnosis_no_dup_code_uq ON public.visit_diagnosis USING btree (visit_id, icd10_code) WHERE ((status)::text = 'ACTIVE'::text);


--
-- Name: visit_diagnosis_one_primary_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visit_diagnosis_one_primary_uq ON public.visit_diagnosis USING btree (visit_id) WHERE (((type)::text = 'PRIMARY'::text) AND ((status)::text = 'ACTIVE'::text));


--
-- Name: visit_diagnosis_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_diagnosis_visit_idx ON public.visit_diagnosis USING btree (visit_id);


--
-- Name: visit_doctor_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_doctor_date_idx ON public.visit USING btree (doctor_id, visit_date);


--
-- Name: visit_one_active_per_patient_poli_day_uq; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX visit_one_active_per_patient_poli_day_uq ON public.visit USING btree (patient_id, polyclinic_id, visit_date) WHERE ((status)::text <> 'CANCELLED'::text);


--
-- Name: visit_patient_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_patient_idx ON public.visit USING btree (patient_id);


--
-- Name: visit_procedure_visit_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_procedure_visit_idx ON public.visit_procedure USING btree (visit_id);


--
-- Name: visit_status_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX visit_status_date_idx ON public.visit USING btree (status, visit_date);


--
-- Name: app_user app_user_staff_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_user
    ADD CONSTRAINT app_user_staff_id_fkey FOREIGN KEY (staff_id) REFERENCES public.medical_staff(id) ON DELETE RESTRICT;


--
-- Name: auth_assignment auth_assignment_item_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_assignment
    ADD CONSTRAINT auth_assignment_item_name_fkey FOREIGN KEY (item_name) REFERENCES public.auth_item(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auth_item_child auth_item_child_child_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_item_child
    ADD CONSTRAINT auth_item_child_child_fkey FOREIGN KEY (child) REFERENCES public.auth_item(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auth_item_child auth_item_child_parent_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_item_child
    ADD CONSTRAINT auth_item_child_parent_fkey FOREIGN KEY (parent) REFERENCES public.auth_item(name) ON UPDATE CASCADE ON DELETE CASCADE;


--
-- Name: auth_item auth_item_rule_name_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_item
    ADD CONSTRAINT auth_item_rule_name_fkey FOREIGN KEY (rule_name) REFERENCES public.auth_rule(name) ON UPDATE CASCADE ON DELETE SET NULL;


--
-- Name: charge_item charge_item_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_item
    ADD CONSTRAINT charge_item_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoice(id) ON DELETE RESTRICT;


--
-- Name: charge_item charge_item_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.charge_item
    ADD CONSTRAINT charge_item_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: doctor_schedule doctor_schedule_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_schedule
    ADD CONSTRAINT doctor_schedule_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.medical_staff(id) ON DELETE RESTRICT;


--
-- Name: doctor_schedule doctor_schedule_polyclinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.doctor_schedule
    ADD CONSTRAINT doctor_schedule_polyclinic_id_fkey FOREIGN KEY (polyclinic_id) REFERENCES public.polyclinic(id) ON DELETE RESTRICT;


--
-- Name: examination examination_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.examination
    ADD CONSTRAINT examination_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: invoice invoice_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoice
    ADD CONSTRAINT invoice_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: lab_order lab_order_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order
    ADD CONSTRAINT lab_order_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.medical_staff(id) ON DELETE RESTRICT;


--
-- Name: lab_order_item lab_order_item_lab_order_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item
    ADD CONSTRAINT lab_order_item_lab_order_id_fkey FOREIGN KEY (lab_order_id) REFERENCES public.lab_order(id) ON DELETE RESTRICT;


--
-- Name: lab_order_item lab_order_item_lab_test_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item
    ADD CONSTRAINT lab_order_item_lab_test_id_fkey FOREIGN KEY (lab_test_id) REFERENCES public.lab_test(id) ON DELETE RESTRICT;


--
-- Name: lab_order_item lab_order_item_resulted_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order_item
    ADD CONSTRAINT lab_order_item_resulted_by_fkey FOREIGN KEY (resulted_by) REFERENCES public.app_user(id) ON DELETE RESTRICT;


--
-- Name: lab_order lab_order_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.lab_order
    ADD CONSTRAINT lab_order_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: payment payment_cashier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_cashier_id_fkey FOREIGN KEY (cashier_id) REFERENCES public.app_user(id) ON DELETE RESTRICT;


--
-- Name: payment payment_invoice_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.payment
    ADD CONSTRAINT payment_invoice_id_fkey FOREIGN KEY (invoice_id) REFERENCES public.invoice(id) ON DELETE RESTRICT;


--
-- Name: prescription prescription_dispensed_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_dispensed_by_fkey FOREIGN KEY (dispensed_by) REFERENCES public.app_user(id) ON DELETE RESTRICT;


--
-- Name: prescription prescription_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.medical_staff(id) ON DELETE RESTRICT;


--
-- Name: prescription_item prescription_item_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_item
    ADD CONSTRAINT prescription_item_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicine(id) ON DELETE RESTRICT;


--
-- Name: prescription_item prescription_item_prescription_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription_item
    ADD CONSTRAINT prescription_item_prescription_id_fkey FOREIGN KEY (prescription_id) REFERENCES public.prescription(id) ON DELETE RESTRICT;


--
-- Name: prescription prescription_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prescription
    ADD CONSTRAINT prescription_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: queue_counter queue_counter_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.queue_counter
    ADD CONSTRAINT queue_counter_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.doctor_schedule(id) ON DELETE RESTRICT;


--
-- Name: stock_movement stock_movement_medicine_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stock_movement
    ADD CONSTRAINT stock_movement_medicine_id_fkey FOREIGN KEY (medicine_id) REFERENCES public.medicine(id) ON DELETE RESTRICT;


--
-- Name: visit_diagnosis visit_diagnosis_icd10_code_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis
    ADD CONSTRAINT visit_diagnosis_icd10_code_fkey FOREIGN KEY (icd10_code) REFERENCES public.icd10(code) ON DELETE RESTRICT;


--
-- Name: visit_diagnosis visit_diagnosis_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_diagnosis
    ADD CONSTRAINT visit_diagnosis_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: visit visit_doctor_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_doctor_id_fkey FOREIGN KEY (doctor_id) REFERENCES public.medical_staff(id) ON DELETE RESTRICT;


--
-- Name: visit visit_patient_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_patient_id_fkey FOREIGN KEY (patient_id) REFERENCES public.patient(id) ON DELETE RESTRICT;


--
-- Name: visit visit_polyclinic_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_polyclinic_id_fkey FOREIGN KEY (polyclinic_id) REFERENCES public.polyclinic(id) ON DELETE RESTRICT;


--
-- Name: visit_procedure visit_procedure_procedure_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_procedure
    ADD CONSTRAINT visit_procedure_procedure_id_fkey FOREIGN KEY (procedure_id) REFERENCES public.medical_procedure(id) ON DELETE RESTRICT;


--
-- Name: visit_procedure visit_procedure_visit_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit_procedure
    ADD CONSTRAINT visit_procedure_visit_id_fkey FOREIGN KEY (visit_id) REFERENCES public.visit(id) ON DELETE RESTRICT;


--
-- Name: visit visit_schedule_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.visit
    ADD CONSTRAINT visit_schedule_id_fkey FOREIGN KEY (schedule_id) REFERENCES public.doctor_schedule(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--

\unrestrict ax5gAn4OLFU4sZpfHxV87GML66rWUq9ZVFL97QKRfF4pZ0dpJb2YIRbPq4htPEr

