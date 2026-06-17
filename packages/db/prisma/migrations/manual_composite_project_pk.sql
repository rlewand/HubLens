-- Allow the same ACC project id across import batches (composite primary key).
ALTER TABLE hublens.project_services DROP CONSTRAINT project_services_batch_id_project_id_fkey;
ALTER TABLE hublens.project_products DROP CONSTRAINT project_products_batch_id_project_id_fkey;
ALTER TABLE hublens.module_evidence DROP CONSTRAINT module_evidence_batch_id_project_id_fkey;
ALTER TABLE hublens.project_maturity_scores DROP CONSTRAINT project_maturity_scores_batch_id_project_id_fkey;
ALTER TABLE hublens.project_notes DROP CONSTRAINT project_notes_batch_id_project_id_fkey;

ALTER TABLE hublens.projects DROP CONSTRAINT projects_pkey;
DROP INDEX IF EXISTS hublens.projects_batch_id_id_key;

ALTER TABLE hublens.projects ADD CONSTRAINT projects_pkey PRIMARY KEY (batch_id, id);

ALTER TABLE hublens.project_services
  ADD CONSTRAINT project_services_batch_id_project_id_fkey
  FOREIGN KEY (batch_id, project_id) REFERENCES hublens.projects(batch_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE hublens.project_products
  ADD CONSTRAINT project_products_batch_id_project_id_fkey
  FOREIGN KEY (batch_id, project_id) REFERENCES hublens.projects(batch_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE hublens.module_evidence
  ADD CONSTRAINT module_evidence_batch_id_project_id_fkey
  FOREIGN KEY (batch_id, project_id) REFERENCES hublens.projects(batch_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE hublens.project_maturity_scores
  ADD CONSTRAINT project_maturity_scores_batch_id_project_id_fkey
  FOREIGN KEY (batch_id, project_id) REFERENCES hublens.projects(batch_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE hublens.project_notes
  ADD CONSTRAINT project_notes_batch_id_project_id_fkey
  FOREIGN KEY (batch_id, project_id) REFERENCES hublens.projects(batch_id, id)
  ON UPDATE CASCADE ON DELETE CASCADE;
