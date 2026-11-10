"""Content/asset regression tests: python3 -m unittest discover -s tests -v."""
from html import escape
import json
from pathlib import Path
import struct
import unittest

ROOT = Path(__file__).resolve().parents[1]
SLUG = 'pichanga-local-callao-jesus-maria'
LEAGUE = 'Peruvian Pichangas (Jesús María)'


class PichangasContentTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.articles = json.loads((ROOT / 'content/articles.json').read_text())
        cls.story = next(a for a in cls.articles if a['id'] == SLUG)
        cls.html = (ROOT / 'articles' / f'{SLUG}.html').read_text()

    def test_league_and_preview_assignment(self):
        league_stories = [a for a in self.articles if a.get('league') == LEAGUE]
        self.assertEqual({a['id'] for a in league_stories}, {SLUG, 'campo-marte-tarbell-return', 'pichanga-tarbell-lawn-tennis-preview'})
        self.assertTrue(self.story['sports'] and self.story['featured'])
        self.assertNotIn('La Molina', (ROOT / 'sports/index.html').read_text())
        self.assertIn('La Molina league later this week', self.story['body'][-1])

    def test_team_line_score(self):
        score = self.story['boxScore']
        self.assertEqual(score['status'], 'FINAL')
        self.assertEqual(score['teams'], [
            {'name': 'Team Local', 'halves': [5, 3], 'final': 8},
            {'name': 'Team Callao', 'halves': [2, 4], 'final': 6},
        ])
        for team in score['teams']:
            self.assertEqual(sum(team['halves']), team['final'])

    def test_reported_player_stats(self):
        player = self.story['boxScore']['player']
        self.assertEqual((player['name'], player['goals'], player['assists'], player['shotsOnGoal']),
                         ('Cameron Tarbell', 2, 3, 5))
        self.assertEqual(player['position'], 'Flex MF/ST')
        self.assertEqual(player['injuryNote'], 'L knee: prior injury / R knee: 2H foul')

    def test_static_article_matches_source(self):
        self.assertEqual(len(self.story['body']), 8)
        for paragraph in self.story['body']:
            self.assertIn(f'<p>{escape(paragraph, quote=True)}</p>', self.html)
        self.assertIn(escape(self.story['title']), self.html)
        self.assertIn('2026-11-05T22:30:00-05:00', self.html)
        self.assertEqual(self.html.count('<table class="box-score__table">'), 2)
        self.assertIn('../' + self.story['boxScoreImage'], self.html)

    def test_graphic_is_real_png(self):
        image = (ROOT / self.story['boxScoreImage']).read_bytes()
        self.assertEqual(image[:8], b'\x89PNG\r\n\x1a\n')
        self.assertEqual(struct.unpack('>II', image[16:24]), (1440, 1140))


if __name__ == '__main__':
    unittest.main()
