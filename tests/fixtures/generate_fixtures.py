"""Generates synthetic UI-like screenshots with a known reference text.

One-off dev tool (needs Pillow, not a project dependency):
    python tests/fixtures/generate_fixtures.py

Output per case in tests/fixtures/screenshots/:
    <case>.png            1080x2400 screenshot-like image
    <case>.expected.txt   reference text, one line per rendered line (UTF-8, LF)
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).parent / "screenshots"
FONTS = Path("C:/Windows/Fonts")
W, H = 1080, 2400

CASES = {
    "ru-notes": {
        "theme": "light",
        "title": "Заметки",
        "lines": [
            "Список дел на пятницу",
            "Купить молоко и хлеб",
            "Позвонить врачу в 15:30",
            "Нужно отправить отчёт до завтра",
            "Оплатить интернет и электричество",
            "Встреча с командой 12 марта",
            "Сайт проекта: https://example.com/plan",
            "Почта: ivan.petrov@example.com",
            "Телефон: +7 912 345 67 89",
        ],
    },
    "ru-chat": {
        "theme": "dark",
        "title": "Сообщения",
        "lines": [
            "Привет! Как дела?",
            "Всё хорошо, спасибо. Работаю над приложением.",
            "Когда сможешь прислать документы?",
            "Сегодня вечером, после шести часов.",
            "Хорошо, жду. Не забудь про договор.",
            "Ссылка на папку: https://disk.example.ru/docs",
            "Увидимся в понедельник утром!",
        ],
    },
    "en-article": {
        "theme": "light",
        "title": "Reading list",
        "lines": [
            "How to organise your digital life",
            "Screenshots pile up quickly on any phone.",
            "Most of them contain links, dates and tasks.",
            "Remember to review them every week.",
            "Read more at https://example.com/articles/42",
            "Contact: support@example.com",
            "Call us: +1 202 555 0143",
            "Deadline is October 31 at 9:00 AM",
        ],
    },
    "en-settings": {
        "theme": "dark",
        "title": "Settings",
        "lines": [
            "Notifications",
            "Allow notifications from this app",
            "Choose when you want to be reminded",
            "Privacy and security",
            "All data stays on your device",
            "Storage used: 128 MB of 2 GB",
            "Need to back up before updating",
        ],
    },
    "pl-todo": {
        "theme": "light",
        "title": "Zadania",
        "lines": [
            "Lista zakupów na weekend",
            "Trzeba kupić mleko, chleb i jajka",
            "Zadzwonić do lekarza jutro rano",
            "Spotkanie w środę o 14:00",
            "Zażółć gęślą jaźń",
            "Żółw łączy się z Łodzią",
            "Strona: https://example.pl/zakupy",
            "E-mail: anna.kowalska@example.pl",
        ],
    },
    "pl-message": {
        "theme": "dark",
        "title": "Wiadomości",
        "lines": [
            "Cześć! Co słychać?",
            "Wszystko dobrze, dziękuję za pytanie.",
            "Kiedy możesz przysłać dokumenty?",
            "Wieczorem, po godzinie osiemnastej.",
            "Świetnie, czekam na wiadomość.",
            "Do zobaczenia w poniedziałek rano!",
            "Numer telefonu: +48 501 234 567",
        ],
    },
}

THEMES = {
    "light": {"bg": (250, 250, 252), "bar": (255, 255, 255), "fg": (24, 24, 28), "dim": (110, 110, 120)},
    "dark": {"bg": (18, 18, 20), "bar": (30, 30, 34), "fg": (236, 236, 240), "dim": (150, 150, 160)},
}


def render(name: str, case: dict) -> None:
    t = THEMES[case["theme"]]
    img = Image.new("RGB", (W, H), t["bg"])
    d = ImageDraw.Draw(img)
    regular = ImageFont.truetype(str(FONTS / "segoeui.ttf"), 46)
    bold = ImageFont.truetype(str(FONTS / "segoeuib.ttf"), 64)

    # No status-bar text: everything visible must be in the reference text.
    d.rectangle([0, 0, W, 90], fill=t["bar"])
    d.ellipse([W - 120, 34, W - 88, 66], fill=t["dim"])
    d.rectangle([0, 90, W, 250], fill=t["bar"])
    d.text((48, 135), case["title"], font=bold, fill=t["fg"])

    y = 330
    for line in case["lines"]:
        d.text((64, y), line, font=regular, fill=t["fg"])
        y += 110

    img.save(OUT / f"{name}.png")
    expected = [case["title"], *case["lines"]]
    (OUT / f"{name}.expected.txt").write_text("\n".join(expected) + "\n", encoding="utf-8", newline="\n")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, case in CASES.items():
        render(name, case)
        print("wrote", name)


if __name__ == "__main__":
    main()
