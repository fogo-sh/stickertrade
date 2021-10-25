defmodule StickertradeWeb.StickerAddLive do
  use StickertradeWeb, :live_view

  alias Stickertrade.Accounts
  alias Stickertrade.Market
  alias Stickertrade.Market.Sticker

  @max_entries 20

  def render(assigns) do
    ~H"""
    <div class="w-1/2 mx-auto">
      <h1>Add Sticker(s)</h1>

      <form class="flex" phx-change="validate-upload" phx-submit="upload">
        <%= live_file_input @uploads.sticker %>
        <%= submit "Upload images", class: "btn-primary" %>
      </form>

      <%= for {_ref, err} <- @uploads.sticker.errors do %>
        <p class="alert alert-error"><%= Phoenix.Naming.humanize(err) %></p>
      <% end %>

      <%= for entry <- @uploads.sticker.entries do %>
        <.form let={f} for={@changesets[entry.ref]} id={entry.ref} phx-change="validate-sticker" phx-submit="add-sticker" class="flex gap-4 mt-4 p-2">
          <div class="flex flex-col p-1">
            <div class="bg-primary border-2 border-primary-600">
              <div class="h-64 w-64">
                <%= live_img_preview entry, class: "h-full w-full object-contain" %>
              </div>

              <progress max="100" value={entry.progress} class="w-64 mt-2" />
            </div>
            <%= error_tag f, :image %>
          </div>

          <div class="flex flex-col">
            <%= hidden_input f, :entry_ref, [value: entry.ref]  %>

            <%= label f, :name %>
            <%= text_input f, :name %>
            <%= error_tag f, :name %>

            <%= label f, :description %>
            <%= textarea f, :description %>
            <%= error_tag f, :description %>

            <div class="mt-3 mb-1">
              <%= submit "Add Sticker", disabled: @changesets[entry.ref].action, class: "btn-primary" %>
              <button phx-click="cancel-upload" phx-value-ref={entry.ref} class="btn-secondary">Cancel</button>
            </div>
          </div>
        </.form>
      <% end %>
    </div>
    """
  end

  def mount(_params, %{"user_token" => user_token}, socket) do
    assigns = %{
      changesets: %{},
      uploaded_files: [],
      current_user: Accounts.get_user_by_session_token(user_token)
    }

    {:ok, socket
     |> assign(assigns)
     |> allow_upload(:sticker,
       accept: ~w(.jpg .jpeg .png),
       max_entries: @max_entries,
       max_file_size: 12_000_000,
     )}
  end

  def handle_event("validate-upload", _params, %{ assigns: %{ uploads: uploads, changesets: changesets } } = socket) do
    entries = uploads.sticker.entries

    changesets = Enum.reduce(entries, changesets, fn entry, changesets ->
      if !Map.has_key?(changesets, entry.ref) do
        changesets |> Map.put(entry.ref, Market.change_sticker(%Sticker{}))
      else
        changesets
      end
    end)

    {:noreply, assign(socket, changesets: changesets)}
  end

  def handle_event("cancel-upload", %{"ref" => ref}, socket) do
    # TODO remove changeset
    {:noreply, cancel_upload(socket, :sticker, ref)}
  end

  def handle_event("upload", _params, socket) do
    uploaded_files =
      consume_uploaded_entries(socket, :sticker, fn %{path: path}, _entry ->
        dest = Path.join([:code.priv_dir(:stickertrade), "static", "uploads", Path.basename(path)])
        File.cp!(path, dest)
        Routes.static_path(socket, "/uploads/#{Path.basename(dest)}")
      end)

    {:noreply,
      socket
      |> put_flash(:info, "#{length(uploaded_files)} file(s) uploaded")
      |> update(:uploaded_files, &(&1 ++ uploaded_files))}
  end

  def handle_event("validate-sticker", %{"sticker" => %{ "entry_ref" => entry_ref } = params}, socket) do
    changeset =
      %Sticker{}
      |> Map.put(:user_id, socket.assigns.current_user.id)
      |> Market.change_sticker(params)
      |> Map.put(:action, :insert)

    changesets = socket.assigns.changesets
    {:noreply, assign(socket, changesets: Map.replace(changesets, entry_ref, changeset))}
  end

  def handle_event("add-sticker", %{"sticker" => %{ "entry_ref" => entry_ref } = params}, socket) do
    changesets = socket.assigns.changesets

    case Market.create_sticker(params) do
      {:ok, _sticker} ->
        {:noreply, socket.put_flash(:info, "Sticker added")}

      {:error, %Ecto.Changeset{} = changeset} ->
        {:noreply, assign(socket, changesets: Map.replace(changesets, entry_ref, changeset))}
    end
  end
end
