export interface Poll {
  id: string
  messageId: string
  question: string
  multiSelect: boolean
  expiresAt: string | null
  createdAt: string
  options: PollOptionWithVotes[]
}

export interface PollOptionWithVotes {
  id: string
  label: string
  position: number
  voteCount: number
  voted: boolean
}
