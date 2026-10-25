CREATE TABLE settings (id integer PRIMARY KEY CHECK(id=1),name text NOT NULL,demo boolean NOT NULL,version integer NOT NULL DEFAULT 1);
CREATE TABLE users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL UNIQUE,password_hash text NOT NULL,role text NOT NULL CHECK(role IN ('finance_manager','owner')),active boolean NOT NULL DEFAULT true,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE sessions (id text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX session_user_idx ON sessions(user_id);
CREATE TABLE login_attempts (key text PRIMARY KEY,count integer NOT NULL,window_start timestamptz NOT NULL);
CREATE TABLE customers (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,phone text NOT NULL UNIQUE,whatsapp text,email text,instagram text,address text,type text NOT NULL DEFAULT 'Individual',notes text,version integer NOT NULL DEFAULT 1,archived boolean NOT NULL DEFAULT false,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX customer_name_idx ON customers(name);
CREATE TABLE services (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,name text NOT NULL,category text NOT NULL,description text,price_minor bigint NOT NULL DEFAULT 0 CHECK(price_minor>=0),duration_minutes integer NOT NULL CHECK(duration_minutes>0),estimated_cost_minor bigint NOT NULL DEFAULT 0 CHECK(estimated_cost_minor>=0),active boolean NOT NULL DEFAULT true,version integer NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE bookings (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,appointment_date date NOT NULL,appointment_time text NOT NULL,category text NOT NULL,status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('inquiry','confirmed','in_progress','completed','cancelled','no_show')),artist text,hairstylist text,notes text,subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(subtotal_minor>=0),discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0 AND discount_minor<=subtotal_minor),total_minor bigint NOT NULL DEFAULT 0 CHECK(total_minor=subtotal_minor-discount_minor),version integer NOT NULL DEFAULT 1,completed_date date,cancel_reason text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX booking_customer_idx ON bookings(customer_id); CREATE INDEX booking_appointment_idx ON bookings(appointment_date); CREATE INDEX booking_status_idx ON bookings(status);
CREATE TABLE booking_items (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT,name text NOT NULL,category text NOT NULL,unit_price_minor bigint NOT NULL DEFAULT 0 CHECK(unit_price_minor>=0),quantity integer NOT NULL CHECK(quantity>0),line_total_minor bigint NOT NULL DEFAULT 0 CHECK(line_total_minor=unit_price_minor*quantity),estimated_cost_minor bigint NOT NULL DEFAULT 0);
CREATE INDEX booking_item_idx ON booking_items(booking_id);
CREATE TABLE payments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN ('receipt','refund','reversal')),status text NOT NULL CHECK(status IN ('unverified','posted')),amount_minor bigint NOT NULL DEFAULT 0 CHECK(amount_minor>0),signed_minor bigint NOT NULL DEFAULT 0,credit_minor bigint NOT NULL DEFAULT 0,method text NOT NULL,date date NOT NULL,reference text,notes text,reason text,parent_id uuid REFERENCES payments(id) ON DELETE RESTRICT,reversal_of_id uuid UNIQUE REFERENCES payments(id) ON DELETE RESTRICT,created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now(),CHECK(status='posted' OR (signed_minor=0 AND credit_minor=0)));
CREATE INDEX payment_booking_idx ON payments(booking_id); CREATE INDEX payment_date_idx ON payments(date);
CREATE TABLE expenses (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),code text NOT NULL UNIQUE,date date NOT NULL,category text NOT NULL,classification text NOT NULL CHECK(classification IN ('overhead','direct','capital')),amount_minor bigint NOT NULL DEFAULT 0 CHECK(amount_minor>0),payee text NOT NULL,description text NOT NULL,method text,booking_id uuid REFERENCES bookings(id) ON DELETE RESTRICT,paid boolean NOT NULL,paid_date date,voided boolean NOT NULL DEFAULT false,notes text,created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX expense_date_idx ON expenses(date); CREATE INDEX expense_booking_idx ON expenses(booking_id);
CREATE TABLE accounts (code text PRIMARY KEY,name text NOT NULL,type text NOT NULL);
CREATE TABLE journals (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),date date NOT NULL,description text NOT NULL,source_type text NOT NULL,source_id uuid NOT NULL,event text NOT NULL,created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX journal_source_event_idx ON journals(source_type,source_id,event); CREATE INDEX journal_date_idx ON journals(date);
CREATE TABLE ledger_lines (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),journal_id uuid NOT NULL REFERENCES journals(id) ON DELETE RESTRICT,account_code text NOT NULL REFERENCES accounts(code) ON DELETE RESTRICT,amount_minor bigint NOT NULL CHECK(amount_minor<>0),booking_id uuid REFERENCES bookings(id) ON DELETE RESTRICT);
CREATE INDEX ledger_account_idx ON ledger_lines(account_code); CREATE INDEX ledger_journal_idx ON ledger_lines(journal_id);
CREATE TABLE audit_logs (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,action text NOT NULL,entity text NOT NULL,entity_id uuid NOT NULL,before jsonb,after jsonb,reason text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX audit_entity_idx ON audit_logs(entity,entity_id); CREATE INDEX audit_time_idx ON audit_logs(created_at);
CREATE TABLE commands (key uuid PRIMARY KEY,actor_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,operation text NOT NULL,hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE attachments (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),entity text NOT NULL,entity_id uuid NOT NULL,name text NOT NULL,mime text NOT NULL,size integer NOT NULL CHECK(size>0 AND size<=3145728),data bytea NOT NULL,created_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX attachment_entity_idx ON attachments(entity,entity_id);

-- Financial journals and the audit trail are append-only, including direct SQL writes.
CREATE FUNCTION reject_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Historical records are append-only. Use a correcting transaction.'; END; $$;
CREATE TRIGGER immutable_journals BEFORE UPDATE OR DELETE ON journals FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_lines BEFORE UPDATE OR DELETE ON ledger_lines FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE TRIGGER no_payment_delete BEFORE DELETE ON payments FOR EACH ROW EXECUTE FUNCTION reject_history_mutation();
CREATE FUNCTION protect_posted_payment() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
 IF OLD.status='posted' THEN RAISE EXCEPTION 'Posted payments cannot be edited. Reverse the transaction.'; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER immutable_posted_payment BEFORE UPDATE ON payments FOR EACH ROW EXECUTE FUNCTION protect_posted_payment();

-- A constraint trigger runs at COMMIT, after all lines have been inserted.
CREATE FUNCTION check_balanced_journal() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_id uuid; balance numeric; line_count integer;
BEGIN
 IF TG_TABLE_NAME='journals' THEN target_id=NEW.id; ELSE target_id=NEW.journal_id; END IF;
 SELECT COALESCE(SUM(amount_minor),0),COUNT(*) INTO balance,line_count FROM ledger_lines WHERE journal_id=target_id;
 IF balance<>0 OR line_count<2 THEN RAISE EXCEPTION 'Unbalanced journal %: balance %, lines %',target_id,balance,line_count; END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER journal_balance_header AFTER INSERT ON journals DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_balanced_journal();
CREATE CONSTRAINT TRIGGER journal_balance_lines AFTER INSERT ON ledger_lines DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_balanced_journal();
