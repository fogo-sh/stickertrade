defmodule StickertradeWeb.PageController do
  use StickertradeWeb, :controller

  def index(conn, _params) do
    render(conn, "index.html")
  end
end
