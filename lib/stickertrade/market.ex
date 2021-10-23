defmodule Stickertrade.Market do
  @moduledoc """
  The Market context.
  """

  import Ecto.Query, warn: false
  alias Stickertrade.Repo

  alias Stickertrade.Market.Sticker

  @doc """
  Returns the list of stickers.

  ## Examples

      iex> list_stickers()
      [%Sticker{}, ...]

  """
  def list_stickers do
    Repo.all(Sticker)
  end

  @doc """
  Gets a single sticker.

  Raises `Ecto.NoResultsError` if the Sticker does not exist.

  ## Examples

      iex> get_sticker!(123)
      %Sticker{}

      iex> get_sticker!(456)
      ** (Ecto.NoResultsError)

  """
  def get_sticker!(id), do: Repo.get!(Sticker, id)

  @doc """
  Creates a sticker.

  ## Examples

      iex> create_sticker(%{field: value})
      {:ok, %Sticker{}}

      iex> create_sticker(%{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def create_sticker(attrs \\ %{}) do
    %Sticker{}
    |> Sticker.changeset(attrs)
    |> Repo.insert()
  end

  @doc """
  Updates a sticker.

  ## Examples

      iex> update_sticker(sticker, %{field: new_value})
      {:ok, %Sticker{}}

      iex> update_sticker(sticker, %{field: bad_value})
      {:error, %Ecto.Changeset{}}

  """
  def update_sticker(%Sticker{} = sticker, attrs) do
    sticker
    |> Sticker.changeset(attrs)
    |> Repo.update()
  end

  @doc """
  Deletes a sticker.

  ## Examples

      iex> delete_sticker(sticker)
      {:ok, %Sticker{}}

      iex> delete_sticker(sticker)
      {:error, %Ecto.Changeset{}}

  """
  def delete_sticker(%Sticker{} = sticker) do
    Repo.delete(sticker)
  end

  @doc """
  Returns an `%Ecto.Changeset{}` for tracking sticker changes.

  ## Examples

      iex> change_sticker(sticker)
      %Ecto.Changeset{data: %Sticker{}}

  """
  def change_sticker(%Sticker{} = sticker, attrs \\ %{}) do
    Sticker.changeset(sticker, attrs)
  end
end
