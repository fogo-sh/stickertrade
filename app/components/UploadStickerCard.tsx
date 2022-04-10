import { Link } from "remix";

export function UploadStickerCard() {
  return (
    <div>
      <Link to={`/upload-sticker/`} className="hover:underline">
        <img
          src={"/images/upload-sticker.webp"}
          alt={`upload sticker icon`}
          className="w-[12em] h-[12em] bg-light-500 border-2 border-light-500 border-opacity-25"
        />
        <p className="my-1 text-lg text-center">upload sticker</p>
      </Link>
    </div>
  );
}
