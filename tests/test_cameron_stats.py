"""Cameron Tarbell running totals: python3 -m unittest discover -s tests -v."""
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[1]
STATS = json.loads((ROOT / 'content/stats/cameron-tarbell.json').read_text())
LEAGUE = 'Peruvian Pichangas (Jesús María)'


def sum_stat(games, key):
    return sum(game[key] for game in games if game.get(key) is not None)


def avg_stat(games, key):
    values = [game[key] for game in games if game.get(key) is not None]
    return (sum(values) / len(values)) if values else None


class CameronTarbellStatsTests(unittest.TestCase):
    def setUp(self):
        self.games = STATS['games']

    def test_only_published_recap_games_are_logged(self):
        self.assertEqual({g['id'] for g in self.games}, {
            'pichanga-local-callao-jesus-maria',
            'pichanga-local-lawn-tennis-jesus-maria',
        })
        self.assertNotIn('campo-marte-tarbell-return', {g['id'] for g in self.games})
        self.assertTrue(all(g['league'] == LEAGUE for g in self.games))
        for game in self.games:
            article = ROOT / game['article']
            self.assertTrue(article.is_file(), game['article'])

    def test_callao_line_matches_recap_and_leaves_stops_unreported(self):
        game = next(g for g in self.games if g['id'] == 'pichanga-local-callao-jesus-maria')
        self.assertEqual((game['goals'], game['assists'], game['shotsOnGoal']), (2, 3, 5))
        self.assertIsNone(game['defensiveStops'])
        self.assertIsNone(game['venue'])
        self.assertEqual((game['scoreFor'], game['scoreAgainst'], game['halftimeFor'], game['halftimeAgainst']), (8, 6, 5, 2))

    def test_lawn_tennis_line_matches_recap(self):
        game = next(g for g in self.games if g['id'] == 'pichanga-local-lawn-tennis-jesus-maria')
        self.assertEqual((game['goals'], game['assists'], game['shotsOnGoal'], game['defensiveStops']), (2, 1, 7, 3))
        self.assertEqual(game['venue'], 'Lawn Tennis')
        self.assertEqual((game['scoreFor'], game['scoreAgainst'], game['halftimeFor'], game['halftimeAgainst']), (16, 11, 5, 7))

    def test_season_totals_and_averages(self):
        self.assertEqual(len(self.games), 2)
        self.assertEqual(sum_stat(self.games, 'goals'), 4)
        self.assertEqual(sum_stat(self.games, 'assists'), 4)
        self.assertEqual(sum_stat(self.games, 'goals') + sum_stat(self.games, 'assists'), 8)
        self.assertEqual(sum_stat(self.games, 'shotsOnGoal'), 12)
        self.assertEqual(sum_stat(self.games, 'defensiveStops'), 3)
        self.assertEqual(avg_stat(self.games, 'goals'), 2.0)
        self.assertEqual(avg_stat(self.games, 'assists'), 2.0)
        self.assertEqual(avg_stat(self.games, 'shotsOnGoal'), 6.0)
        self.assertEqual(avg_stat(self.games, 'defensiveStops'), 3.0)


if __name__ == '__main__':
    unittest.main()
