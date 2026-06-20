export type UserStoryMatchCandidate = {
    id?: string | null;
    display_id?: string | null;
    tuleap_artifact_id?: number | string | null;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    description?: string | null;
};

export function getUserStoryDisplayId(story: UserStoryMatchCandidate): string {
    if (story.display_id) return story.display_id;
    if (story.tuleap_artifact_id !== undefined && story.tuleap_artifact_id !== null) {
        return `US-${story.tuleap_artifact_id}`;
    }
    return story.id || '';
}

export function userStoryMatchesQuery(query: string, story: UserStoryMatchCandidate): boolean {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return true;

    const fields = [
        story.title,
        getUserStoryDisplayId(story),
        story.tuleap_artifact_id == null ? null : String(story.tuleap_artifact_id),
        story.status,
        story.priority,
        story.description,
    ];

    return fields.some(value => value?.toLowerCase().includes(normalizedQuery));
}

export function filterUserStories<T extends UserStoryMatchCandidate>(query: string, stories: T[]): T[] {
    return stories.filter(story => userStoryMatchesQuery(query, story));
}
