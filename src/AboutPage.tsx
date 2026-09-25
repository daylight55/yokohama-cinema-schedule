import { localize } from "./i18n";
import {
  ArrowRightIcon,
  BuildingsIcon,
  CalendarDotsIcon,
  FilmSlateIcon,
  PathIcon,
} from "@phosphor-icons/react";
import { todayInJst } from "../shared/date";
import { hashForAppView, type AppView } from "./lib";
import { PageHeader, PageShell } from "./PageLayout";

const FEATURES: ReadonlyArray<{
  title: string;
  description: string;
  icon: typeof CalendarDotsIcon;
  view: Extract<
    AppView,
    "schedule" | "movies" | "cinemas" | "viewingPlans" | "planner"
  >;
}> = [
  {
    title: "今から観られる上映を探す",
    description:
      "横浜周辺の上映を時間順にまとめ、今日の現在時刻から観られる作品を見つけられます。",
    icon: CalendarDotsIcon,
    view: "schedule",
  },
  {
    title: "観たい作品を整理する",
    description:
      "気になる作品にはスターを付け、鑑賞済み・興味なしの作品は上映スケジュールから外せます。",
    icon: FilmSlateIcon,
    view: "movies",
  },
  {
    title: "映画館までの移動を見積もる",
    description:
      "ベース出発地点と移動方法を登録すると、映画館ごとの所要時間や間に合いそうな上映を確認できます。",
    icon: BuildingsIcon,
    view: "cinemas",
  },
  {
    title: "観に行く上映をまとめる",
    description:
      "上映回のはまむびくんを押すと、映画館と開始時刻を鑑賞予定としてまとめて確認できます。",
    icon: CalendarDotsIcon,
    view: "viewingPlans",
  },
  {
    title: "映画はしごを組み立てる",
    description:
      "空いている日と気になる作品から、移動時間を考慮した映画はしごの候補を作れます。",
    icon: PathIcon,
    view: "planner",
  },
];

export function AboutPage() {
  const today = todayInJst();

  return (
    <PageShell className="about-page" labelledBy="about-title">
      <PageHeader
        eyebrow={localize("このサイトについて")}
        title={localize("はまむび！でできること")}
        titleId="about-title"
        lead={localize(
          "横浜周辺の映画館を、テレビ番組表のような時間軸で横断して探すためのサイトです。",
        )}
      />

      <ul className="about-feature-list" role="list">
        {localize(
          FEATURES.map(({ title, description, icon: Icon, view }) => (
            <li key={title}>
              <a
                className="about-feature-link"
                href={hashForAppView(
                  view,
                  view === "cinemas" ? {} : { date: today },
                )}
              >
                <Icon size={24} weight="duotone" aria-hidden="true" />
                <div>
                  <h2>{localize(title)}</h2>
                  <p>{localize(description)}</p>
                </div>
                <ArrowRightIcon
                  className="about-feature-arrow"
                  size={18}
                  aria-hidden="true"
                />
              </a>
            </li>
          )),
        )}
      </ul>

      <section className="about-note">
        <h2>{localize("作品名について")}</h2>
        <p>
          {localize(
            "作品名は公開情報を検索して確認しています。直訳は使用せず、原題・英語題と出典を保存します。",
          )}
        </p>
      </section>
      <section className="about-note" aria-labelledby="about-note-title">
        <h2 id="about-note-title">{localize("上映情報について")}</h2>
        <p>
          {localize(
            "上映時刻や販売状況は変更されることがあります。鑑賞前に各映画館の公式サイトで最新情報をご確認ください。",
          )}
        </p>
      </section>

      <section
        className="about-note tmdb-attribution"
        aria-labelledby="tmdb-attribution-title"
      >
        <h2 id="tmdb-attribution-title">{localize("作品の公開日について")}</h2>
        <a
          href="https://www.themoviedb.org/"
          target="_blank"
          rel="noreferrer"
          aria-label={localize("TMDBを開く")}
        >
          <img
            src="/tmdb-logo.svg"
            alt={localize("TMDB")}
            width="137"
            height="18"
          />
        </a>
        <p>
          {localize(
            "日本公開日はTMDBのAPIから取得しています。上映中の作品とタイトルが一致した場合に表示します。",
          )}
        </p>
        <p lang="en">
          {localize(
            "This website uses TMDB and the TMDB APIs but is not endorsed, certified, or otherwise approved by TMDB.",
          )}
        </p>
      </section>
    </PageShell>
  );
}
