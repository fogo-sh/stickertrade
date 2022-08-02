import { Link } from "@remix-run/react";

export function UploadStickerCard() {
  return (
    <div className="flex items-center justify-center w-[12em] h-[14em]">
      <Link to={`/upload-sticker/`} className="hover:underline">
        <img
          src={"/images/upload-sticker.webp"}
          alt={`upload sticker icon`}
          className="w-[10em] h-[10em] bg-light-500 border-2 border-light-500 border-opacity-25 rounded-full object-cover"
        />
        <p className="mt-2.5 text-lg text-center">upload sticker</p>
      </Link>
    </div>
  );
}
