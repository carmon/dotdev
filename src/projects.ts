import callGithubQL from "./lib/githubql";

type GithubLanguage = {
  name: string;
};

type GithubRepo = {
  name: string;
  description: string | null;
  homepageUrl: string | null;
  url: string;
  languages: {
    nodes: GithubLanguage[];
  };
};

type GithubSearchEdge = {
  repo: GithubRepo | null;
};

type GithubSearchResult = {
  repos: GithubSearchEdge[];
};

type GithubGraphQLResponse = {
  data?: {
    search: GithubSearchResult;
  };
  errors?: { message: string }[];
};

type Project = {
  name: string;
  description: string;
  homepageUrl: string;
  url: string;
  languages: string[];
};

export async function getProjectsList(count: number): Promise<Project[]> {
  if (!process.env.GH_PA_TOKEN || !process.env.GH_SEARCH_QUERY) {
    throw new Error('Missing GitHub configuration');
  }

  try {
    const res = await callGithubQL(`
      query {
        search(
          type: REPOSITORY, 
          query: "${process.env.GH_SEARCH_QUERY}",
          last: ${count}
        ) {
          repos: edges {
            repo: node {
              ... on Repository {
                name
                description
                homepageUrl
                url
                languages(first: 10) {
                  nodes {
                    name
                  }
                }
              }
            }
          }
        }
      }
    `);

    if (!res.ok) {
      throw new Error(`GitHub API request failed with ${res.status}`);
    }
  
    const body: GithubGraphQLResponse = await res.json();
    if (body.errors?.length) {
      throw new Error(body.errors[0]?.message || 'GitHub API query failed');
    }
  
    const repos = body.data?.search?.repos || [];
    const projects = repos
      .map(({ repo }) => repo)
      .filter((repo): repo is GithubRepo => Boolean(repo))
      .map((repo) => ({
        ...repo,
        description: repo.description ?? '',
        homepageUrl: repo.homepageUrl ?? '',
        languages: (repo.languages?.nodes || []).reduce((prev, curr) =>  [...prev, curr.name], [] as string[]),
      }));
  
    return projects as Project[];
  } catch (error) {
    console.error('Error fetching projects:', error);
  }

  return [];
};
