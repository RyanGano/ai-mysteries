import { shopUrl } from "../lib/shop";
import type { ShopItem } from "../lib/types";
import "../styles/shop-shelf.css";

// The "From the story" Amazon shelf — curated props from the book, driven entirely by the
// book's shopItems data. Quiet by design: it reads as an afterword, never as an ad block.
// Renders nothing when the book authors no items. Shared by the book landing page and the
// ending page.
export default function ShopShelf({ items }: { items: ShopItem[] | undefined }) {
  const linkable = (items ?? []).filter((item) => shopUrl(item));
  if (linkable.length === 0) return null;
  return (
    <section className="shop-shelf" aria-label="From the story">
      <h2 className="shop-shelf-title">From the story</h2>
      <ul className="shop-shelf-list">
        {linkable.map((item) => (
          <li key={item.label} className="shop-shelf-item">
            <a
              href={shopUrl(item)}
              target="_blank"
              rel="noopener noreferrer sponsored nofollow"
              className="shop-shelf-link"
            >
              {item.label} &rarr;
            </a>
            {item.note && <span className="shop-shelf-note">{item.note}</span>}
          </li>
        ))}
      </ul>
      <p className="shop-shelf-disclosure">
        Links go to Amazon; as an Amazon Associate we earn from qualifying purchases.
      </p>
    </section>
  );
}
