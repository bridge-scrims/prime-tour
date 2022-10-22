
CREATE TABLE IF NOT EXISTS scrims_prime_tour_2_signup (
    user_id TEXT PRIMARY KEY,
    mc_uuid uuid NOT NULL,
    timezone TEXT NOT NULL,
    joined TEXT NOT NULL
);

