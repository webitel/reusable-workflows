package main

import (
	"testing"

	"github.com/google/go-github/v50/github"
	"github.com/stretchr/testify/require"

	"github.com/webitel/reusable-workflows/actions/backport-action/ghutil"
)

func TestBackportTargets(t *testing.T) {
	branches := []*github.Branch{
		{Name: github.String("v25.08")},
		{Name: github.String("v25.05")},
		{Name: github.String("v24.12")},
		{Name: github.String("v23.02")},
	}

	t.Run("with backport labels", func(t *testing.T) {
		labels := []string{
			"backport v25.08",
			"backport v25.05",
		}

		targets, err := BackportTargets(branches, labels)
		require.NoError(t, err)
		require.Equal(t, []string{
			"v25.08",
			"v25.05",
		}, toStringList(targets))
	})

	t.Run("with non-backport labels", func(t *testing.T) {
		labels := []string{
			"type/bug",
			"backport v25.08",
			"release/latest",
			"backport v12.0.x",
			"type/ci",
			"backport v25.05",
			"add-to-changelog",
		}

		targets, err := BackportTargets(branches, labels)
		require.NoError(t, err)
		require.Equal(t, []string{
			"v25.08",
			"v25.05",
		}, toStringList(targets))
	})

}

func toStringList(branches []ghutil.Branch) []string {
	r := make([]string, len(branches))

	for i, v := range branches {
		r[i] = v.Name
	}

	return r
}
