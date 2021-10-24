defmodule StickertradeWeb.StickerAddLive do
  use StickertradeWeb, :live_view

  alias Stickertrade.Market
  alias Stickertrade.Market.Sticker

  @max_entries 20

  def render(assigns) do
    ~H"""
    <div class="w-1/2 mx-auto">
      <h1>Add Sticker(s)</h1>

      <form class="flex" phx-change="update" phx-submit="upload">
        <%= live_file_input @uploads.sticker %>
        <%= submit "Upload images", class: "btn-primary" %>
      </form>

      <%= for entry <- @uploads.sticker.entries do %>
        <.form let={f} for={@changeset} phx-submit="add" class="flex gap-4 mt-4 p-2">
          <div class="flex flex-col bg-primary p-1 border-2 border-primary-600 ">
            <div class="h-64 w-64">
              <%= live_img_preview entry, class: "h-full w-full object-contain" %>
            </div>

            <progress max="100" value="{entry.progress}" class="w-64 mt-2" />
          </div>

          <div class="flex flex-col">
            <%= if @changeset.action do %>
              <div class="alert-error">
                <p>Oops, something went wrong! Please check the errors below.</p>
              </div>
            <% end %>

            <%= label f, :name %>
            <%= text_input f, :name %>
            <%= error_tag f, :name %>

            <%= label f, :description %>
            <%= textarea f, :description %>
            <%= error_tag f, :description %>

            <div class="mt-3 mb-1">
              <%= submit "Add Sticker", class: "btn-primary" %>
              <button phx-click="cancel-upload" phx-value-ref={entry.ref} class="btn-secondary">Cancel</button>
            </div>
          </div>
        </.form>
      <% end %>
    </div>
    """
  end

  def mount(_params, _session, socket) do
    assigns = %{
      changeset: Market.change_sticker(%Sticker{}),
      uploaded_files: [],
    }

    {:ok, socket
     |> assign(assigns)
     |> allow_upload(:sticker,
       accept: ~w(.jpg .jpeg .png),
       max_entries: @max_entries,
       max_file_size: 1_000,
     )}
  end

  def handle_event("update", _params, socket) do
    {:noreply, socket}
  end

  def handle_event("cancel-upload", %{"ref" => ref}, socket) do
    {:noreply, cancel_upload(socket, :sticker, ref)}
  end

  def handle_event("upload", _params, socket) do
    IO.puts "hello"

    uploaded_files =
      consume_uploaded_entries(socket, :avatar, fn %{path: path}, _entry ->
        dest = Path.join("priv/static/uploads", Path.basename(path))
        File.cp!(path, dest)
        Routes.static_path(socket, "/uploads/#{Path.basename(dest)}")
      end)

    IO.puts "world"

    {:noreply,
      socket
      |> put_flash(:info, "#{length(uploaded_files)} file(s) uploaded")
      |> update(:uploaded_files, &(&1 ++ uploaded_files))}
  end

  def handle_event("validate", %{"sticker" => params}, socket) do
    changeset =
      %Sticker{}
      |> Market.change_sticker(params)
      |> Map.put(:action, :insert)

    {:noreply, assign(socket, changeset: changeset)}
  end

  def handle_event("add", %{"sticker" => params}, socket) do
    case Market.create_sticker(params) do
      {:ok, _sticker} ->
        {:noreply, socket.put_flash(:info, "Sticker added")}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, changeset: changeset)}
    end
  end
end
