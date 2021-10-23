defmodule Stickertrade.Repo.Migrations.CreateStickers do
  use Ecto.Migration

  def change do
    create table(:stickers) do
      add :name, :string
      add :description, :string
      add :image, :string
      add :user_id , :integer

      timestamps()
    end
  end
end
