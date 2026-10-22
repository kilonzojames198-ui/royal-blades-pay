create table if not exists payments (
  id serial primary key,
  phone text not null,
  amount integer not null,
  description text,
  status text not null default 'PENDING',
  checkout_request_id text unique,
  merchant_request_id text,
  mpesa_receipt text,
  result_desc text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
