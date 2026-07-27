import {
  BuildingsIcon,
  CalendarDotsIcon,
  FilmSlateIcon,
  PathIcon,
} from "@phosphor-icons/react";

const FEATURES = [
  {
    title: "今から観られる上映を探す",
    description:
      "横浜周辺の上映を時間順にまとめ、今日の現在時刻から観られる作品を見つけられます。",
    icon: CalendarDotsIcon,
  },
  {
    title: "観たい作品を整理する",
    description:
      "気になる作品にはスターを付け、鑑賞済み・興味なしの作品は上映スケジュールから外せます。",
    icon: FilmSlateIcon,
  },
  {
    title: "映画館までの移動を見積もる",
    description:
      "自宅と移動方法を登録すると、映画館ごとの所要時間や間に合いそうな上映を確認できます。",
    icon: BuildingsIcon,
  },
  {
    title: "映画はしごを組み立てる",
    description:
      "空いている日と気になる作品から、移動時間を考慮した映画はしごの候補を作れます。",
    icon: PathIcon,
  },
] as const;

export function AboutPage() {
  return (
    <section className="about-page" aria-labelledby="about-title">
      <header className="about-heading">
        <p>このサイトについて</p>
        <h1 id="about-title">はまむび！でできること</h1>
        <p className="about-lead">
          横浜周辺の映画館を、テレビ番組表のような時間軸で横断して探すためのサイトです。
        </p>
      </header>

      <ul className="about-feature-list">
        {FEATURES.map(({ title, description, icon: Icon }) => (
          <li key={title}>
            <Icon size={24} weight="duotone" aria-hidden="true" />
            <div>
              <h2>{title}</h2>
              <p>{description}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="about-note" aria-labelledby="about-note-title">
        <h2 id="about-note-title">上映情報について</h2>
        <p>
          上映時刻や販売状況は変更されることがあります。鑑賞前に各映画館の公式サイトで最新情報をご確認ください。
        </p>
      </section>
    </section>
  );
}
