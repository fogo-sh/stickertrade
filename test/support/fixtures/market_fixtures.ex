defmodule Stickertrade.MarketFixtures do
  @moduledoc """
  This module defines test helpers for creating
  entities via the `Stickertrade.Market` context.
  """

  @doc """
  Generate a sticker.
  """
  def sticker_fixture(attrs \\ %{}) do
    {:ok, sticker} =
      attrs
      |> Enum.into(%{
        description: "some description",
        image: "some image",
        name: "some name"
      })
      |> Stickertrade.Market.create_sticker()

    sticker
  end
end
