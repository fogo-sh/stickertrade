defmodule Stickertrade.MarketTest do
  use Stickertrade.DataCase

  alias Stickertrade.Market

  describe "stickers" do
    alias Stickertrade.Market.Sticker

    import Stickertrade.MarketFixtures

    @invalid_attrs %{description: nil, image: nil, name: nil}

    test "list_stickers/0 returns all stickers" do
      sticker = sticker_fixture()
      assert Market.list_stickers() == [sticker]
    end

    test "get_sticker!/1 returns the sticker with given id" do
      sticker = sticker_fixture()
      assert Market.get_sticker!(sticker.id) == sticker
    end

    test "create_sticker/1 with valid data creates a sticker" do
      valid_attrs = %{description: "some description", image: "some image", name: "some name"}

      assert {:ok, %Sticker{} = sticker} = Market.create_sticker(valid_attrs)
      assert sticker.description == "some description"
      assert sticker.image == "some image"
      assert sticker.name == "some name"
    end

    test "create_sticker/1 with invalid data returns error changeset" do
      assert {:error, %Ecto.Changeset{}} = Market.create_sticker(@invalid_attrs)
    end

    test "update_sticker/2 with valid data updates the sticker" do
      sticker = sticker_fixture()
      update_attrs = %{description: "some updated description", image: "some updated image", name: "some updated name"}

      assert {:ok, %Sticker{} = sticker} = Market.update_sticker(sticker, update_attrs)
      assert sticker.description == "some updated description"
      assert sticker.image == "some updated image"
      assert sticker.name == "some updated name"
    end

    test "update_sticker/2 with invalid data returns error changeset" do
      sticker = sticker_fixture()
      assert {:error, %Ecto.Changeset{}} = Market.update_sticker(sticker, @invalid_attrs)
      assert sticker == Market.get_sticker!(sticker.id)
    end

    test "delete_sticker/1 deletes the sticker" do
      sticker = sticker_fixture()
      assert {:ok, %Sticker{}} = Market.delete_sticker(sticker)
      assert_raise Ecto.NoResultsError, fn -> Market.get_sticker!(sticker.id) end
    end

    test "change_sticker/1 returns a sticker changeset" do
      sticker = sticker_fixture()
      assert %Ecto.Changeset{} = Market.change_sticker(sticker)
    end
  end
end
