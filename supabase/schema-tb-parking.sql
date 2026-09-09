-- tb_parking: 대전 공영주차장 정보 (공공데이터포털 getParkingInfoList).
-- 채우기: POST /api/parking/seed

create table if not exists public.tb_parking (
  parking_id varchar(20) primary key,       -- PARKING_ID
  name varchar(200) not null,               -- NAME

  lat numeric(10,7) not null,               -- LAT
  lon numeric(12,7) not null,               -- LON

  addr01 varchar(300),                      -- ADDR01
  addr02 varchar(300),                      -- ADDR02

  divide_num varchar(20),                   -- DIVIDE_NUM
  type_num varchar(20),                     -- TYPE_NUM
  land_level_num varchar(20),               -- LAND_LEVEL_NUM

  total_parking_lot integer,                -- TOTAL_PARKING_LOT
  available_total_lot integer,              -- AVAILABLE_TOTAL_LOT
  available_res_qty integer,                -- AVAILABLE_RES_QTY

  restrict_code varchar(20),                -- RESTRICT_CODE
  operateday_code varchar(100),             -- OPERATEDAY_CODE

  weekday_open_time varchar(10),            -- WEEKDAY_OPEN_TIME
  weekday_close_time varchar(10),           -- WEEKDAY_CLOSE_TIME

  sat_open_time varchar(10),                -- SAT_OPEN_TIME
  sat_close_time varchar(10),                -- SAT_CLOSE_TIME

  holiday_open_time varchar(10),            -- HOLIDAY_OPEN_TIME
  holiday_close_time varchar(10),           -- HOLIDAY_CLOSE_TIME

  freecharge_basetime integer,              -- FREECHARGE_BASETIME
  reservation_code varchar(10),             -- RESERVATION_CODE

  additional varchar(500),                  -- ADDITIONAL

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists parking_updated_at on public.tb_parking;
create trigger parking_updated_at
  before update on public.tb_parking
  for each row execute function public.set_updated_at();
