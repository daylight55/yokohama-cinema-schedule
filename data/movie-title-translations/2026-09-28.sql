-- Editorial review of machine-translation fallbacks. These are NOT verified release titles.
-- Apply after scripts/translate-titles.mjs; preserves all retry counters and verified reference titles.
-- Correct the place name 吉原; keep the edition label.
UPDATE movie_title_translations SET english_title='New Gintama Movie: Yoshiwara in Flames (Super Inferno Edition)', model='codex-reviewed-translation', status='translated', last_error=NULL, updated_at='2026-09-28T01:15:00.000Z' WHERE title_key='新劇場版銀魂-吉原大炎上-<超炎上版>' AND model='@cf/qwen/qwen3-30b-a3b-fp8';
-- Keep the series name and the second-part designation.
UPDATE movie_title_translations SET english_title='Final Movement: Sound! Euphonium — Part 2', model='codex-reviewed-translation', status='translated', last_error=NULL, updated_at='2026-09-28T01:15:00.000Z' WHERE title_key='『最終楽章響け!ユーフォニアム』後編' AND model='@cf/qwen/qwen3-30b-a3b-fp8';
-- Same film spelling without Japanese quotation marks.
UPDATE movie_title_translations SET english_title='Final Movement: Sound! Euphonium — Part 2', model='codex-reviewed-translation', status='translated', last_error=NULL, updated_at='2026-09-28T01:15:00.000Z' WHERE title_key='最終楽章響け!ユーフォニアム後編' AND model='@cf/qwen/qwen3-30b-a3b-fp8';
-- Keep the main film title, anniversary number and subtitle.
UPDATE movie_title_translations SET english_title='[Live Premiere Cast Appearance] V-Cinext: Kamen Rider Kabuto 20th — Heir to the Heavens', model='codex-reviewed-translation', status='translated', last_error=NULL, updated_at='2026-09-28T01:15:00.000Z' WHERE title_key='[完成披露舞台挨拶中継]vシネクスト「仮面ライダーカブト20th天を継ぐもの」' AND model='@cf/qwen/qwen3-30b-a3b-fp8';
-- Clarify the nested event/film titles and grammar without claiming an official release name.
UPDATE movie_title_translations SET english_title='Cinema Debut × Kotetsu-kun Family Screening: Space Something Kotetsu-kun — Find the Alien Who Slipped Out!', model='codex-reviewed-translation', status='translated', last_error=NULL, updated_at='2026-09-28T01:15:00.000Z' WHERE title_key='映画館デビュー×こてつくんのちょっくらファミリー上映会『映画「宇宙なんちゃらこてつくん」うっかり出てきた宇宙人を探せ!』' AND model='@cf/qwen/qwen3-30b-a3b-fp8';
