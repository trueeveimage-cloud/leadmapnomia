create unique index if not exists alerts_org_change_unique
  on alerts(organization_id, change_id);

create unique index if not exists alert_deliveries_alert_recipient_unique
  on alert_deliveries(alert_id, recipient_email);
