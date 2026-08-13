CREATE TABLE public."USER" (
    user_id SERIAL PRIMARY KEY,
    email CHARACTER VARYING(50) NOT NULL,
    password CHARACTER VARYING(255),
    nickname CHARACTER VARYING(30) NOT NULL,
    auth_provider CHARACTER VARYING(255) NOT NULL,
    provider_id CHARACTER VARYING(255),
    profile_image_url TEXT,
    is_admin BOOLEAN NOT NULL DEFAULT FALSE,
    account_status CHARACTER VARYING(10) NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    introduction CHARACTER VARYING(200)
);

CREATE TABLE public."PLACE" (
    place_id BIGINT PRIMARY KEY,
    place_name CHARACTER VARYING(255) NOT NULL,
    place_category CHARACTER VARYING(100),
    address CHARACTER VARYING(255) NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    thumbnail_url TEXT,
    start_time TIME WITHOUT TIME ZONE,
    closed_days CHARACTER VARYING(255),
    last_order TIME WITHOUT TIME ZONE,
    average_rating NUMERIC(3,2),
    default_stay_mins INTEGER NOT NULL,
    pet_is_allowed BOOLEAN NOT NULL DEFAULT FALSE,
    google_place_id CHARACTER VARYING(255),
    end_time TIME WITHOUT TIME ZONE
);

CREATE TABLE public."INQUIRY" (
    inquiry_id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public."USER"(user_id) ON DELETE CASCADE,
    title CHARACTER VARYING(50) NOT NULL,
    content TEXT NOT NULL,
    status CHARACTER VARYING(20) NOT NULL DEFAULT 'WAITING',
    answer_content TEXT,
    answered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    itinerary_id INTEGER REFERENCES public."COURSE"(course_id),
    answered_by INTEGER REFERENCES public."USER"(user_id),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE TABLE public."TRIP_PLAN" (
    plan_id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public."USER"(user_id) ON DELETE CASCADE,
    start_time TIMESTAMP WITH TIME ZONE NOT NULL,
    end_time TIMESTAMP WITH TIME ZONE NOT NULL,
    start_location CHARACTER VARYING(255),
    start_latitude DOUBLE PRECISION,
    start_longitude DOUBLE PRECISION,
    end_location CHARACTER VARYING(255),
    end_latitude DOUBLE PRECISION,
    end_longitude DOUBLE PRECISION,
    with_pet BOOLEAN NOT NULL DEFAULT FALSE,
    meal_preference TEXT,
    preferred_themes CHARACTER VARYING(255)
);

CREATE TABLE public."PLAN_MANDATORY_PLACE" (
    plan_id INTEGER NOT NULL REFERENCES public."TRIP_PLAN"(plan_id) ON DELETE CASCADE,
    place_id BIGINT NOT NULL REFERENCES public."PLACE"(place_id),
    fixed_visit_time TIMESTAMP WITH TIME ZONE,
    PRIMARY KEY (plan_id, place_id)
);

CREATE TABLE public."COURSE" (
    course_id SERIAL PRIMARY KEY,
    plan_id INTEGER NOT NULL REFERENCES public."TRIP_PLAN"(plan_id) ON DELETE CASCADE,
    course_type CHARACTER VARYING(20) NOT NULL,
    total_moving_time INTEGER NOT NULL,
    total_walking_dist INTEGER NOT NULL,
    total_transfer_count INTEGER NOT NULL,
    total_estimated_fare INTEGER NOT NULL,
    warnings_json TEXT,
    status CHARACTER VARYING(20) NOT NULL DEFAULT 'DRAFT',
    title CHARACTER VARYING(50),
    saved_at TIMESTAMP WITH TIME ZONE,
    save_request_id UUID,
    saved_snapshot_json TEXT,
    saved_travel_start_time TIMESTAMP WITH TIME ZONE,
    saved_travel_end_time TIMESTAMP WITH TIME ZONE
);

CREATE TABLE public."COURSE_NODE" (
    node_id SERIAL PRIMARY KEY,
    course_id INTEGER NOT NULL REFERENCES public."COURSE"(course_id) ON DELETE CASCADE,
    place_id BIGINT NOT NULL REFERENCES public."PLACE"(place_id),
    visit_order INTEGER NOT NULL,
    node_type CHARACTER VARYING(20) NOT NULL,
    arrival_time TIMESTAMP WITH TIME ZONE NOT NULL,
    departure_time TIMESTAMP WITH TIME ZONE NOT NULL,
    stay_duration_mins INTEGER NOT NULL
);

CREATE TABLE public."ROUTE_SECTION" (
    route_id SERIAL PRIMARY KEY,
    origin_place_id BIGINT NOT NULL REFERENCES public."PLACE"(place_id),
    dest_place_id BIGINT NOT NULL REFERENCES public."PLACE"(place_id),
    transit_time_mins INTEGER NOT NULL,
    walking_distance_m INTEGER NOT NULL,
    transfer_count INTEGER NOT NULL,
    transport_mode CHARACTER VARYING(50) NOT NULL,
    estimated_fare INTEGER NOT NULL,
    path_details TEXT,
    UNIQUE (origin_place_id, dest_place_id)
);

CREATE TABLE public."REFRESH_TOKENS" (
    refresh_token_id BIGSERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public."USER"(user_id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);