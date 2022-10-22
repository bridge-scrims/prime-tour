
CREATE TABLE IF NOT EXISTS scrims_prime_tour_2_signup (
    user_id TEXT PRIMARY KEY,
    mc_uuid uuid NOT NULL,
    timezone TEXT NOT NULL,
    joined TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scrims_prime_tour_2_match (
    match_id BIGINT,
    channel_id TEXT,
    guild_id TEXT NOT NULL,
    user1_id TEXT NOT NULL,
    user2_id TEXT NOT NULL,
    PRIMARY KEY (match_id, channel_id)
);

CREATE OR REPLACE FUNCTION scrims_prime_tour_2_match_add(matches json, guild_id text)
RETURNS json
AS $$
DECLARE
    match json;
    new scrims_prime_tour_2_match;
    inserted jsonb = '[]'::jsonb;
BEGIN
    FOR match IN SELECT * FROM json_array_elements(matches)
    LOOP
        EXECUTE 'INSERT INTO scrims_prime_tour_2_match VALUES ($1, $2, $3, $4, $5) RETURNING *' 
            USING (match->>0)::bigint, match->>1, guild_id, match->>2, match->>3 INTO new;
        inserted = inserted || to_jsonb(new);
    END LOOP;
    RETURN inserted;
END $$ 
LANGUAGE plpgsql;