// test/seed.js
import * as path from 'path'
import * as fs from 'fs'
import { Models } from '@dbModels'

const SeedDb = {
  start: async () => {
    try {
      const mockDataDir = path.join(__dirname, 'integration/mock')
      const files = fs.readdirSync(mockDataDir).filter(file => file.endsWith('.json'))

      for (const file of files) {
        // Extract model name from filename (e.g., 'Dao.json' -> 'Dao')
        const modelName = path.basename(file, '.json')

        // Check if model exists
        if (!Models[modelName]) {
          console.warn(`⚠️  Model ${modelName} not found, skipping ${file}`)
          continue
        }

        // Read JSON data
        const filePath = path.join(mockDataDir, file)
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'))

        // Clear existing data (optional - remove if you want to append)
        await Models[modelName].deleteMany({})
        console.log(`🧹 Cleared existing data for ${modelName}`)

        // Insert data
        if (Array.isArray(jsonData)) {
          if (jsonData.length > 0) {
            await Models[modelName].insertMany(jsonData)
            console.log(`✅ Inserted ${jsonData.length} ${modelName} documents`)
          }
        } else {
          // Single document
          await Models[modelName].create(jsonData)
          console.log(`✅ Inserted 1 ${modelName} document`)
        }
      }

      console.log('🌱 Seeding completed successfully!')
    } catch (error) {
      console.error('❌ Seeding failed:', error)
      throw error
    } finally {
      console.log('Seeding completed')
    }
  },
}

export default SeedDb
