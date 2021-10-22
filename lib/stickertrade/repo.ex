defmodule Stickertrade.Repo do
  use Ecto.Repo,
    otp_app: :stickertrade,
    adapter: Ecto.Adapters.Postgres
end
