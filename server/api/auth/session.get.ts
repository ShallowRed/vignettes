import { getAppSession } from '../../utils/actor'

export default defineEventHandler(event => getAppSession(event))
