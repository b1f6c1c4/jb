#!/usr/bin/env python

import sys

if len(sys.argv) != 5:
    print(f'Usage: {sys.argv[0]} <keywords.txt> <locations.txt> <npages> postgresql://[username]:[password]@[host]:[port]/[database]')
    sys.exit(1)

import psycopg
from tqdm import trange, tqdm
import traceback
import os
import csv
import time
import random
import warnings
import pandas as pd
from selenium import webdriver
from urllib.parse import urljoin, urlparse
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.common.exceptions import NoSuchElementException
from selenium.webdriver.support import expected_conditions as EC
import re
from selenium.webdriver.chrome.service import Service as ChromeService
from webdriver_manager.chrome import ChromeDriverManager
# from selenium.webdriver.firefox.service import Service as FirefoxService
# from webdriver_manager.firefox import FirefoxDriverManager
from selenium.webdriver.common.action_chains import ActionChains
warnings.filterwarnings('ignore')

def the_browser():
    service = ChromeService(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service)
    return driver 

#__________________________________________________________________________________________________________________________#

base_url = 'https://www.linkedin.com/jobs/search/?position=1&pageNum=0'

#___________________________________________________________________________________________________________________________#
class linked_in_JobScraper():
    def __init__(self,cur,npages):
        self.cur = cur
        self.npages = npages
        self.browser = the_browser()
        self.links_processed = 0
        self.links_threshold = random.randint(520,680)
        self.pause_duration = random.randint(1*60,3*60)
        self.nt_parsed_link = []
        self.job_data_df = pd.DataFrame(columns=["job_title", "job_description", "organization_name", 
                      "location", "department", "key_skills", "seniority_level", 
                      "employment_type", "industries", "job_function", "job_link","source","searched_keyword"])
        self.source = "linkedin"
        self.target_button_class = "infinite-scroller__show-more-button--visible"

    def touch(self,url):
        self.cur.execute("UPDATE jobs SET atime = CURRENT_TIMESTAMP WHERE job_link = %s", (url,))
        cnt = int(self.cur.statusmessage.split(' ')[1])
        return cnt > 0
          
    def job_scrapper(self,job_link,key_words):
        job_dict = {}
        retries = 0
        max_retries = random.randint(5,8)
        while retries < max_retries:
            try:
                job_title_element = WebDriverWait(self.browser,2).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 'h2.top-card-layout__title, h1.top-card-layout__title')))
                job_title = job_title_element.text if job_title_element else None
                job_dict["job_title"] = str(job_title)

                job_description_element = self.browser.find_element(By.CSS_SELECTOR,"div.show-more-less-html__markup")
                job_description = job_description_element.get_attribute("innerHTML")
                job_dict["job_description"] = str(job_description)

                org_name_element = WebDriverWait(self.browser,2).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'a.topcard__org-name-link.topcard__flavor--black-link')))
                org_name_text = org_name_element.text if org_name_element else None
                job_dict["organization_name"] = str(org_name_text)

                location_element = WebDriverWait(self.browser,2).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'span.topcard__flavor.topcard__flavor--bullet')))
                location_text = location_element.text if location_element else None
                job_dict["location"] = str(location_text)

                Job_details  = self.browser.find_element(By.CLASS_NAME,"description__job-criteria-list")
                Job_details = Job_details.text if Job_details else None
                if Job_details: 
                    Job_details = Job_details.split("\n")
                    Job_details = [i.strip() for i in Job_details if i.strip() != ""]
                else:
                    Job_details = []
                key_mapping = {"seniority level" : "seniority_level", 
                               "employment type" : "employment_type", "job function":"job_function"} 

                for i in range(0, len(Job_details), 2):
                    original_key = Job_details[i].lower() 
                    value = Job_details[i + 1] 
                    if original_key in key_mapping:
                        desired_key = key_mapping[original_key] 
                    else:
                        desired_key = original_key

                    job_dict[desired_key] = str(value)

                canonical_link = urljoin(job_link, urlparse(job_link).path)
                job_dict["job_link"] = canonical_link 

                job_dict["source"] = self.source
                
                job_dict['searched_keyword'] = key_words
                return job_dict

            except Exception as e:
                self.nt_parsed_link.append(job_link)
                print(f"An error occurred:  - {str(e)}")
                retries += 1
                print(f"Retrying ({retries}/{max_retries}) for {job_link}")
            
                try:
                    self.browser.get(job_link)
                    time.sleep(2)
                except Exception as retry_error:
                    # print(f"Error retrying: {str(retry_error)}")
                    pass         
        print(f"Max retries reached for {job_link}. unable to scrape data.")
        return None
           
    #_____________________________________________________________________________________________________#

    def is_functionality_1_applicable(self):
        try:
            self.browser.find_element(By.CLASS_NAME,"contextual-sign-in-modal__modal-dismiss")
            return True
        except NoSuchElementException:
            return False
    #______________________________________________________________________________________________________#

    def cancel_popup(self):
        try:
            wait = WebDriverWait(self.browser,2)
            cancel_button = wait.until(EC.presence_of_element_located((By.CLASS_NAME,"contextual-sign-in-modal__modal-dismiss")))
            cancel_button.click()
        except Exception as e:
            pass   
    #________________________________________________________________________________________________________#

    def hit_see_job(self):
        try:
            wait = WebDriverWait(self.browser,2)
            cancel_button = wait.until(EC.presence_of_element_located((By.CLASS_NAME,"top-card-layout__cta")))
            cancel_button.click()
        except Exception as e:
            pass 
    #__________________________________________________________________________________________________________#

    def click_cancel_button(self):
        try:
            button_class_name = "cta-modal__dismiss-btn"
            wait = WebDriverWait(self.browser, 2)
            cancel_button = wait.until(EC.presence_of_element_located((By.CLASS_NAME, button_class_name)))
            cancel_button.click()
        except Exception as e:
            pass  

    #____________________________________________________________________________________________________________#

    def find_search_bar_with_retry(self, max_retries=random.randint(5,7), delay_between_retries=3):
        retries = 0
        while retries < max_retries:
            try:
                search_bar = self.browser.find_element(By.XPATH,"//input[@id='job-search-bar-keywords']")
                return search_bar
            except NoSuchElementException:
                print(f"Search bar not found. Retrying ({retries + 1}/{max_retries})...")
                retries += 1
                time.sleep(delay_between_retries)

        # print("Max retries reached. Unable to find the search bar.")
        return None

    #_____________________________________________________________________________________________________________#

    def scrape_and_store_batches(self, key_words, locations):
        job_links = set()
        
        for loc in locations:
            for key in key_words:
                retries = 0
                max_retries = random.randint(4,7)
                while retries < max_retries:
                    try:
                        last_height = self.browser.execute_script("return document.body.scrollHeight")
                        self.browser.get(base_url)
                        print(f'started scrapping for url : {key} with location {loc}' )
                        self.browser.maximize_window()
                        time.sleep(2)
                        try:
                            self.click_cancel_button()
                            self.cancel_popup()
                        except NoSuchElementException:
                            pass
                        try:
                            # Retry finding the search bar with a maximum of 5 retries
                            search_bar = self.find_search_bar_with_retry()
                            if not search_bar:
                                raise NoSuchElementException("Search bar not found.")

                            search_bar.clear()
                            search_bar.send_keys(key)

                            search_bar_location = self.browser.find_element(By.XPATH , "//input[@id='job-search-bar-location']")
                            search_bar_location.clear()
                            search_bar_location.send_keys(loc)

                            button = self.browser.find_element(By.XPATH , "//button[@data-tracking-control-name='public_jobs_jobs-search-bar_base-search-bar-search-submit']")
                            button.click()
                            time.sleep(8)
                            self.browser.execute_script(f"window.scrollBy(0, {50});")
                            # self.browser.save_screenshot(f'{key}, {loc}.png')

                            print('scrolling')
                            
                            for i in range(self.npages):
                                self.browser.execute_script("window.scrollTo(0, document.body.scrollHeight);")
                                time.sleep(7)
                                try:
                                    button = WebDriverWait(self.browser, 2).until(
                                        EC.visibility_of_element_located((By.CLASS_NAME, self.target_button_class)))
                                    button.click()
                                    time.sleep(7)
                                except:
                                    pass
                                new_height = self.browser.execute_script("return document.body.scrollHeight")
                                if new_height == last_height:
                                    break
                                last_height = new_height
                                
                            # self.browser.save_screenshot(f'001_{key},{loc}.png')    

                            time.sleep(2)
                            html_list = self.browser.find_element(By.CLASS_NAME , 'jobs-search__results-list')
                            job_links_list = html_list.find_elements(By.CSS_SELECTOR , 'div a')
                            for link in job_links_list:
                                if '/jobs/view/' in link.get_attribute('href'):
                                    link = link.get_attribute('href')
                                    canonical_link = urljoin(link, urlparse(link).path)
                                    job_links.add(canonical_link)
                            print(f'[{loc}]/[{key}]: {len(job_links)}')

                            for url in tqdm(list(job_links)):
                                if self.touch(url):
                                    continue
                                # print(f'started scraping for job_link....')
                                try:
                                    self.browser.get(url)
                                    self.browser.maximize_window()
                                    time.sleep(5)

                                    func_01 = self.is_functionality_1_applicable()
                                    if func_01 == False:
                                        self.browser.execute_script(f"window.scrollBy(0, {50});")
                                        try:
                                            self.click_cancel_button()
                                        except NoSuchElementException:
                                            pass
                                        time.sleep(3)
                                        job_data = self.job_scrapper(url,key)
                                        if job_data:
                                            self.push_to_db(job_data)
                                    else:
                                        try:
                                            self.cancel_popup()
                                        except NoSuchElementException:
                                            pass
                                        time.sleep(2)
                                        self.browser.execute_script(f"window.scrollBy(0, {50});")
                                        time.sleep(2)
                                        self.hit_see_job()
                                        time.sleep(3)
                                        try:
                                            self.click_cancel_button()
                                        except NoSuchElementException:
                                            pass
                                        random_sleep = random.randint(7, 25)
                                        time.sleep(random_sleep)
                                        job_data = self.job_scrapper(url,key)

                                        if job_data:
                                            self.push_to_db(job_data)
                                        else:
                                            print("Both methods failed to scrape job data")

                                    self.links_processed += 1

                                    if self.links_threshold != 0 and self.links_processed % self.links_threshold == 0:
                                        print(
                                            f"Processed {self.links_processed} links. Taking a pause for {self.pause_duration/60} minutes.")
                                        time.sleep(self.pause_duration)

                                except Exception as e:
                                    print(f"Error while scraping {url}: {str(e)}")
                            job_links.clear()
                            print(f"Clearing previous links of location search {key} and location {loc} from the list")
                            print(f'scrapping pause for {self.pause_duration} sec')
                            time.sleep(self.pause_duration)

                            break

                        except NoSuchElementException as e:
                            # print(f"Element not found for {base_url}: {str(e)}")
                            retries += 1
                            print(f"Retrying ({retries}/{max_retries}) for {key}")
                            continue

                    except Exception as e:
                        print(f"An error occurred for {base_url}: {e}")
                        traceback.print_tb(e.__traceback__)
                        retries += 1
                        print(f"Retrying ({retries}/{max_retries}) for {key}")
    #____________________________________________________________________________________________________________#

    def push_to_db(self, job_data):
        # self.job_data_df = pd.DataFrame(columns=["job_title", "job_description", "organization_name", 
        #               "location", "department", "key_skills", "seniority_level", 
        #               "employment_type", "industries", "job_function", "job_link","source","searched_keyword"])
        fields = ['applied']
        values = [False]
        for k in job_data:
            fields.append(k)
            values.append(job_data[k])
        self.cur.execute(f"INSERT INTO jobs ({','.join(fields)}) VALUES ({','.join(['%s']*len(values))}) ON CONFLICT DO NOTHING", values)

with open(sys.argv[1]) as file:
    keywords = [line.strip() for line in file if not line.startswith('#')]
with open(sys.argv[2]) as file:
    locations = [line.strip() for line in file if not line.startswith('#')]

with psycopg.connect(sys.argv[4], autocommit=True) as conn:
    with conn.cursor() as cur:
        scrapper = linked_in_JobScraper(cur, int(sys.argv[3]))
        scrapper.scrape_and_store_batches(keywords,locations) 
