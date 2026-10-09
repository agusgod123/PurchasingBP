-- Integritas data tambahan yang tidak dapat dinyatakan di schema.prisma.

-- Dokumen harus terhubung ke tepat satu induk transaksi.
ALTER TABLE "documents" ADD CONSTRAINT "documents_single_parent_chk"
  CHECK (num_nonnulls("request_id", "vendor_quote_id", "purchase_order_id", "goods_receipt_id", "handover_id", "discrepancy_id") = 1);
ALTER TABLE "documents" ADD CONSTRAINT "documents_size_chk" CHECK ("size_bytes" > 0);

-- Komentar terhubung ke tepat satu induk.
ALTER TABLE "comments" ADD CONSTRAINT "comments_single_parent_chk"
  CHECK (num_nonnulls("request_id", "purchase_order_id") = 1);

-- Kuantitas dan nilai uang.
ALTER TABLE "request_items" ADD CONSTRAINT "request_items_qty_chk"
  CHECK ("quantity" > 0 AND "cancelled_quantity" >= 0 AND "cancelled_quantity" <= "quantity" AND "estimated_unit_price" >= 0);
ALTER TABLE "request_version_items" ADD CONSTRAINT "request_version_items_qty_chk"
  CHECK ("quantity_snapshot" > 0 AND "estimated_unit_price_snapshot" >= 0);
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_qty_chk"
  CHECK ("quantity_ordered" > 0 AND "closed_quantity" >= 0 AND "closed_quantity" <= "quantity_ordered" AND "unit_price" >= 0 AND "line_total" >= 0);
ALTER TABLE "goods_receipt_items" ADD CONSTRAINT "goods_receipt_items_qty_chk"
  CHECK ("quantity_received" > 0 AND "quantity_accepted" >= 0 AND "quantity_rejected" >= 0
         AND "quantity_received" = "quantity_accepted" + "quantity_rejected");
ALTER TABLE "handover_items" ADD CONSTRAINT "handover_items_qty_chk"
  CHECK ("quantity" > 0 AND ("confirmed_quantity" IS NULL OR "confirmed_quantity" >= 0));
ALTER TABLE "receipt_discrepancies" ADD CONSTRAINT "receipt_discrepancies_qty_chk" CHECK ("quantity" > 0);
ALTER TABLE "vendor_quotes" ADD CONSTRAINT "vendor_quotes_amount_chk" CHECK ("total_amount" >= 0);
ALTER TABLE "department_budgets" ADD CONSTRAINT "department_budgets_amount_chk" CHECK ("amount" >= 0);
ALTER TABLE "requests" ADD CONSTRAINT "requests_total_chk" CHECK ("estimated_total" >= 0);
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_total_chk" CHECK ("total_amount" >= 0);
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_amount_range_chk"
  CHECK ("min_amount" IS NULL OR "max_amount" IS NULL OR "min_amount" <= "max_amount");
ALTER TABLE "approval_rule_steps" ADD CONSTRAINT "approval_rule_steps_target_chk"
  CHECK (("approver_type" <> 'USER' OR "approver_user_id" IS NOT NULL)
     AND ("approver_type" <> 'ROLE' OR "approver_role_id" IS NOT NULL));
ALTER TABLE "document_requirements" ADD CONSTRAINT "document_requirements_min_chk" CHECK ("min_count" >= 1);

-- Satu instance persetujuan merujuk subjek yang sesuai jenisnya.
ALTER TABLE "approval_instances" ADD CONSTRAINT "approval_instances_subject_chk" CHECK (
  ("subject_type" = 'REQUEST' AND "request_version_id" IS NOT NULL)
  OR ("subject_type" = 'CHANGE_REQUEST' AND "change_request_id" IS NOT NULL)
  OR ("subject_type" = 'CANCELLATION' AND "cancellation_request_id" IS NOT NULL)
  OR ("subject_type" = 'DISCREPANCY_RESOLUTION' AND "discrepancy_id" IS NOT NULL)
);

-- Pencarian teks sederhana yang tidak peka huruf besar/kecil.
CREATE INDEX "requests_title_lower_idx" ON "requests" (lower("title"));
CREATE INDEX "request_items_item_name_lower_idx" ON "request_items" (lower("item_name"));

-- ---------------------------------------------------------------------
-- Keamanan Supabase: aplikasi mengakses database hanya melalui server
-- (Prisma, peran pemilik tabel). Aktifkan RLS tanpa policy pada semua tabel
-- sehingga Data API (PostgREST) dengan kunci anon/authenticated tidak dapat
-- membaca atau menulis data. Pemilik tabel tetap melewati RLS.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = current_schema() LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM anon', current_schema());
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM anon', current_schema());
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA %I FROM authenticated', current_schema());
    EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA %I FROM authenticated', current_schema());
  END IF;
END $$;
