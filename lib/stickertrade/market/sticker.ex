defmodule Stickertrade.Market.Sticker do
  use Ecto.Schema
  import Ecto.Changeset

  alias Stickertrade.Accounts

  schema "stickers" do
    field :description, :string
    field :image, :string
    field :name, :string
    field :user_id, :integer

    belongs_to :owner, Accounts.User

    timestamps()
  end

  @doc false
  def changeset(sticker, attrs) do
    sticker
    |> cast(attrs, [:name, :description, :image, :user_id])
    |> validate_required([:name, :description, :image, :user_id])
  end
end
