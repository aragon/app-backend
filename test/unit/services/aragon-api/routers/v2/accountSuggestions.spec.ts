import MainRouter from '@api/routers'
import { Models } from '@dbModels'
import ErrorMiddleware from '@middlewares/error'
import { expect } from 'chai'
import Koa from 'koa'
import supertest from 'supertest'

const wallet = '0x0000000000000000000000000000000000000011'

function request() {
  const app = new Koa()
  app.use(ErrorMiddleware()).use(MainRouter.router().routes())
  return supertest(app.callback())
}

describe('Workspace account suggestions route', () => {
  it('serves V2 and root fallback with default pagination', async () => {
    await Models.Dao.create({
      network: 'ethereum-mainnet',
      address: '0x0000000000000000000000000000000000000101',
      creatorAddress: wallet,
      isActive: true,
    })
    const v2 = await request().get(`/v2/workspaces/suggestions/${wallet}`)
    const root = await request().get(`/workspaces/suggestions/${wallet}`)
    expect(v2.status).to.equal(200)
    expect(root.status).to.equal(200)
    expect(v2.body).to.deep.equal(root.body)
    expect(v2.body.metadata).to.deep.equal({ page: 1, pageSize: 10, totalPages: 1, totalRecords: 1 })
    expect(v2.body.data[0].role).to.equal('creator')
  })

  it('rejects invalid addresses, pages, and unsupported query options', async () => {
    for (const path of [
      '/v2/workspaces/suggestions/bad',
      `/v2/workspaces/suggestions/${wallet}?page=0`,
      `/v2/workspaces/suggestions/${wallet}?pageSize=51`,
      `/v2/workspaces/suggestions/${wallet}?sort=name`,
      `/v2/workspaces/suggestions/${wallet}?search=foo`,
    ]) {
      expect((await request().get(path)).status).to.equal(400)
    }
  })
})
