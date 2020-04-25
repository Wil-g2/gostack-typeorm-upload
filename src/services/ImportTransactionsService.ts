import fs from 'fs';
import csv from 'csv-parse';
import { getRepository, In, getCustomRepository } from 'typeorm';
import Transaction from '../models/Transaction';
import TransactionRepository from '../repositories/TransactionsRepository';
// import uploadConfig from '../config/upload';
import Category from '../models/Category';

interface TransactionCSV {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(path: string): Promise<Transaction[]> {
    const transactionsRepository = getCustomRepository(TransactionRepository);
    const categoriesRepository = getRepository(Category);
    const fileImport = fs.createReadStream(path);
    const parser = csv({ from: 2 });
    const parseCsv = fileImport.pipe(parser);

    const categories: string[] = [];
    const transactions: TransactionCSV[] = [];

    parseCsv.on('data', async row => {
      const [title, type, value, category] = row.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) {
        return;
      }
      categories.push(category);
      transactions.push({
        title,
        type,
        value,
        category,
      });
    });

    await new Promise(resolve => parseCsv.on('end', resolve));
    const categoriesExist = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const titleCategoriesExist = categoriesExist.map(
      (category: Category) => category.title,
    );

    const createCategories = categories
      .filter(category => !titleCategoriesExist.includes(category))
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      createCategories.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const categiriesAll = [...categoriesExist, ...newCategories];

    const newTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        value: transaction.value,
        type: transaction.type,
        category: categiriesAll.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(newTransactions);

    await fs.promises.unlink(path);
    return newTransactions;
  }
}

export default ImportTransactionsService;
