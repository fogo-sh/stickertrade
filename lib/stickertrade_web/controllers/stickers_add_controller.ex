defmodule StickertradeWeb.StickersAddController do
  use StickertradeWeb, :controller

  def new(conn, _params) do
    render(conn, "new.html")
  end
end
