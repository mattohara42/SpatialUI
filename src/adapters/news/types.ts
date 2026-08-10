/**
 * What a news feed hands over.
 *
 * The thinnest useful shape, and deliberately the shape an RSS item already
 * has: a headline, a standfirst, a link, and a timestamp. Anything richer would
 * be a promise about the feed that a real one may not keep — RSS carries no
 * country tag, no category anybody agrees on, and no severity — and building on
 * a promise like that is how a seam stops being swappable.
 *
 * This is the first source in the project whose records are **text**. The other
 * two are handed structure for free: a box score has a home team and an away
 * team, a bar has a symbol and a close. A headline has a sentence. Turning that
 * sentence into a record is `extract.ts`, and it is the layer this adapter
 * exists to make possible.
 */

export interface Article {
  /** Stable across fetches. A live adapter uses the item's guid. */
  id: string;
  /** Who published it. Carried through to the detail panel. */
  outlet: string;
  title: string;
  /** The standfirst or description. May be empty; extraction reads both. */
  summary: string;
  url: string;
  /** Epoch ms. */
  publishedAt: number;
}

/**
 * What a source has to provide.
 *
 * A live adapter fetches RSS from a world desk, parses items into `Article`s,
 * and reports `live: true`. Nothing downstream changes — extraction, the world
 * snapshot, the blights, and the panel all read `Article` and nothing else.
 *
 * `articles` takes a window rather than returning everything, because a feed is
 * unbounded backwards and every caller here wants a recent slice. `until`
 * defaults to now.
 */
export interface NewsSource {
  readonly name: string;
  /** False when the articles are generated. Never quietly true. */
  readonly live: boolean;
  articles(since: number, until?: number): Article[];
}
